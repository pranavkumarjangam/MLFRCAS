import cv2
import numpy as np
import os
from mtcnn import MTCNN
from keras_facenet import FaceNet
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity
import time
import threading
import json
import base64
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
from env_config import get_required_env

# Global variables
auth_active = False
auth_thread = None
stop_flag = threading.Event()
cap = None
current_frame = None
frame_lock = threading.Lock()
auth_result = None

# MongoDB Setup
client = MongoClient(get_required_env("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
users_collection = db['users']

# Initialize models
embedder = FaceNet()
detector = MTCNN()

# Flask app
app = Flask(__name__)
CORS(app)

def align_face(face, output_size=(160, 160)):
    return cv2.resize(face, output_size)

def get_embeddings_from_db(email):
    user_data = users_collection.find_one({"email": email})
    if user_data and "embeddings" in user_data:
        return [np.array(embedding) for embedding in user_data['embeddings']]
    return None

def authenticate_continuous(email, threshold=0.5):
    global auth_active, stop_flag, cap, current_frame, auth_result
    
    try:
        stored_embeddings = get_embeddings_from_db(email)
        if not stored_embeddings:
            auth_result = {"success": False, "message": "No face data found"}
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            auth_result = {"success": False, "message": "Cannot open webcam"}
            return

        start_time = time.time()
        timeout = 30
        
        while auth_active and not stop_flag.is_set():
            ret, frame = cap.read()
            if not ret:
                continue

            # Store frame for streaming
            with frame_lock:
                _, buffer = cv2.imencode('.jpg', frame)
                current_frame = base64.b64encode(buffer).decode('utf-8')

            if time.time() - start_time > timeout:
                auth_result = {"success": False, "message": "Timeout"}
                break

            faces = detector.detect_faces(frame)
            if faces:
                for face in faces:
                    x1, y1, width, height = face['box']
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = x1 + width, y1 + height
                    face_pixels = frame[y1:y2, x1:x2]

                    if face_pixels.size == 0:
                        continue

                    face_pixels = cv2.cvtColor(face_pixels, cv2.COLOR_BGR2RGB)
                    face_pixels = align_face(face_pixels)
                    face_pixels = np.expand_dims(face_pixels, axis=0)
                    face_embedding = embedder.embeddings(face_pixels).flatten()

                    similarities = [cosine_similarity([face_embedding], [stored])[0][0] for stored in stored_embeddings]
                    max_similarity = max(similarities) if similarities else 0

                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    if max_similarity >= threshold:
                        user_info = users_collection.find_one({"email": email})
                        auth_result = {
                            "success": True,
                            "message": "Authentication successful!",
                            "user": {"name": user_info.get("name", ""), "email": email}
                        }
                        cv2.putText(frame, "AUTHENTICATED!", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                        
                        with frame_lock:
                            _, buffer = cv2.imencode('.jpg', frame)
                            current_frame = base64.b64encode(buffer).decode('utf-8')
                        
                        auth_active = False
                        break
                    else:
                        cv2.putText(frame, f"Authenticating... {max_similarity:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

            time.sleep(0.1)

    except Exception as e:
        auth_result = {"success": False, "message": f"Error: {str(e)}"}
    finally:
        cleanup_resources()

def cleanup_resources():
    global cap, current_frame
    if cap:
        cap.release()
        cap = None
    # Clear any stale frame so UI doesn't show old image after stop
    try:
        with frame_lock:
            current_frame = None
    except Exception:
        current_frame = None

@app.route('/current-frame')
def get_current_frame():
    global current_frame, auth_active
    # Only return a frame when session is active to avoid stale frames
    with frame_lock:
        frame_to_send = current_frame if auth_active else None
    return jsonify({
        'frame': frame_to_send,
        'active': auth_active
    })

@app.route('/status')
def get_status():
    global auth_result, auth_active
    if auth_result:
        return jsonify(auth_result)
    return jsonify({"status": "running" if auth_active else "idle"})

def start_authentication(email):
    global auth_active, auth_thread, stop_flag, auth_result, current_frame
    
    if auth_active:
        return {"success": False, "message": "Already running"}
    
    auth_active = True
    stop_flag.clear()
    auth_result = None
    with frame_lock:
        current_frame = None
    
    auth_thread = threading.Thread(target=authenticate_continuous, args=(email,))
    auth_thread.daemon = True
    auth_thread.start()
    
    return {"success": True, "message": "Started"}

def stop_authentication():
    global auth_active, stop_flag
    auth_active = False
    stop_flag.set()
    cleanup_resources()
    return {"success": True, "message": "Stopped"}

@app.route('/stop', methods=['POST'])
def stop_route():
    """HTTP endpoint to stop the current authentication session."""
    result = stop_authentication()
    return jsonify(result)

@app.route('/start', methods=['POST'])
def start_route():
    data = request.get_json(silent=True) or {}
    email = data.get('email')
    if not email:
        return jsonify({"success": False, "message": "Email is required"}), 400
    result = start_authentication(email)
    status_code = 200 if result.get("success") else 409
    return jsonify(result), status_code

@app.route('/health')
def health_route():
    return jsonify({ 'ok': True, 'status': 'running' if auth_active else 'idle' })

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "start" and len(sys.argv) > 2:
            email = sys.argv[2]
            start_authentication(email)
            
            # Start Flask server
            flask_thread = threading.Thread(target=lambda: app.run(host='0.0.0.0', port=5002, debug=False))
            flask_thread.daemon = True
            flask_thread.start()
            
            # Wait for completion
            while auth_active:
                time.sleep(1)
                
            if auth_result:
                print(json.dumps(auth_result))
            else:
                print(json.dumps({"success": False, "message": "Failed"}))
                
        elif command == "stop":
            result = stop_authentication()
            print(json.dumps(result))
    else:
        app.run(host='0.0.0.0', port=5002, debug=True)
