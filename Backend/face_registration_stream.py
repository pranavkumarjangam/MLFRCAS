import cv2
import numpy as np
import os
from mtcnn import MTCNN
from keras_facenet import FaceNet
from pymongo import MongoClient
import time
import threading
import json
import base64
from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import datetime
from env_config import get_required_env

# --- Global State ---
registration_active = False
registration_thread = None
stop_flag = threading.Event()
cap = None
current_frame = None
frame_lock = threading.Lock()
registration_status = {"status": "idle", "message": "Registration has not started."}

# --- Database & Models ---
DB_URI = get_required_env("MONGODB_URI")
client = MongoClient(DB_URI)
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
users_collection = db['users']

embedder = FaceNet()
detector = MTCNN()

# --- Flask App ---
app = Flask(__name__)
CORS(app)

# --- Core Functions ---
def align_face(face, output_size=(160, 160)):
    return cv2.resize(face, output_size)

def save_embeddings_to_db(email, embeddings):
    try:
        users_collection.update_one(
            {"email": email},
            {"$set": {
                "embeddings": [e.tolist() for e in embeddings],
                "faceRegistered": True,
                "face_updated_at": datetime.datetime.now()
            }}
        )
        # Notify backend to mark as registered
        import requests
        try:
            requests.post('http://localhost:3001/register-face/complete', json={"email": email}, timeout=2)
        except Exception as notify_err:
            print(f"Warning: Could not notify backend to mark faceRegistered: {notify_err}")
        return True, "Embeddings saved successfully."
    except Exception as e:
        return False, f"DB Error: {str(e)}"

def registration_process(email, name, max_samples=10):
    global registration_active, stop_flag, cap, current_frame, registration_status

    try:
        registration_status = {"status": "initializing", "message": "Starting camera..."}
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise IOError("Cannot open webcam")

        face_embeddings = []
        last_capture_time = time.time()

        last_face_box = None

        while registration_active and not stop_flag.is_set() and len(face_embeddings) < max_samples:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.1)
                continue

            # --- Face Detection and Sample Capture ---
            faces = detector.detect_faces(frame)
            
            if faces:
                face = faces[0]
                x1, y1, width, height = face['box']
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = x1 + width, y1 + height
                last_face_box = (x1, y1, x2, y2)

                # Capture a sample periodically
                if time.time() - last_capture_time > 1:
                    face_pixels = frame[y1:y2, x1:x2]
                    if face_pixels.size > 0:
                        face_pixels_rgb = cv2.cvtColor(face_pixels, cv2.COLOR_BGR2RGB)
                        aligned_face = align_face(face_pixels_rgb)
                        embedding = embedder.embeddings(np.expand_dims(aligned_face, axis=0)).flatten()
                        face_embeddings.append(embedding)
                        last_capture_time = time.time()
                        
                        registration_status = {
                            "status": "capturing", 
                            "message": f"Captured {len(face_embeddings)} of {max_samples} samples.",
                            "progress": len(face_embeddings) / max_samples
                        }
                
                # --- Visual Feedback ---
                # Draw rectangle around the face
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                # Display sample count near the box
                feedback_text = f"Sample {len(face_embeddings)}/{max_samples}"
                cv2.putText(frame, feedback_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            elif last_face_box: # If face was lost, draw the last known box for a moment
                cv2.rectangle(frame, (last_face_box[0], last_face_box[1]), (last_face_box[2], last_face_box[3]), (0, 0, 255), 2)
                cv2.putText(frame, "Face not detected", (last_face_box[0], last_face_box[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            # --- Encode and Send Frame for UI ---
            with frame_lock:
                _, buffer = cv2.imencode('.jpg', frame)
                current_frame = base64.b64encode(buffer).decode('utf-8')

            time.sleep(0.05)

        # --- Finalization ---
        if len(face_embeddings) >= max_samples:
            success, message = save_embeddings_to_db(email, face_embeddings)
            if success:
                registration_status = {"status": "completed", "message": "Registration successful!"}
            else:
                registration_status = {"status": "error", "message": message}
        elif stop_flag.is_set():
            registration_status = {"status": "stopped", "message": "Registration was stopped manually."}
        else:
            registration_status = {"status": "error", "message": "Failed to capture enough samples."}

    except Exception as e:
        registration_status = {"status": "error", "message": f"An error occurred: {str(e)}"}
    finally:
        cleanup_resources(reset_status=False)
        registration_active = False

def cleanup_resources(reset_status=True):
    """Fully reset the global state to idle."""
    global registration_active, registration_thread, stop_flag, cap, current_frame, registration_status
    
    stop_flag.set() # Signal thread to stop

    with frame_lock:
        if cap:
            cap.release()
            cap = None
        current_frame = None

    # Wait briefly for the worker to exit if we're not currently on that worker thread
    if (
        registration_thread
        and registration_thread.is_alive()
        and registration_thread is not threading.current_thread()
    ):
        registration_thread.join(timeout=1.0) 

    # Reset all state variables to their initial values
    registration_active = False
    registration_thread = None
    stop_flag.clear()
    if reset_status:
        registration_status = {"status": "idle", "message": "Registration has not started."}

# --- Flask Routes ---
@app.route('/start', methods=['POST'])
def start_route():
    global registration_active, registration_thread, stop_flag, registration_status
    
    # Force-clean the state before starting a new session.
    # This is a more aggressive approach to prevent stale states
    cleanup_resources()

    # Now, check if it's still active (it shouldn't be, but as a safeguard)
    if registration_active:
        return jsonify({"success": False, "message": "Registration already in progress after a reset attempt."}), 400

    data = request.get_json()
    email = data.get('email')
    name = data.get('name')
    if not email or not name:
        return jsonify({"success": False, "message": "Email and name are required."}), 400

    registration_active = True
    stop_flag.clear()
    registration_status = {"status": "starting", "message": "Registration process is starting."}
    
    registration_thread = threading.Thread(target=registration_process, args=(email, name))
    registration_thread.daemon = True
    registration_thread.start()
    
    return jsonify({"success": True, "message": "Registration process started."})

@app.route('/stop', methods=['POST'])
def stop_route():
    """Stops the registration process and cleans up all resources."""
    global registration_active
    
    if not registration_active:
        # Still perform cleanup to handle any orphaned processes or states
        registration_status.update({"status": "stopped", "message": "No active registration to stop."})
        cleanup_resources(reset_status=False)
        return jsonify({"success": True, "message": "No active registration, but state cleaned up just in case."})

    registration_status.update({"status": "stopped", "message": "Registration process stopped and resources released."})
    cleanup_resources(reset_status=False)
    
    return jsonify({"success": True, "message": "Registration process stopped and resources released."})

@app.route('/status')
def status_route():
    return jsonify(registration_status)

@app.route('/current-frame')
def frame_route():
    with frame_lock:
        frame_to_send = current_frame if registration_active else None
    return jsonify({'frame': frame_to_send, 'active': registration_active})

@app.route('/health')
def health_route():
    return jsonify({'ok': True, 'status': 'running' if registration_active else 'idle'})

@app.route('/reset', methods=['POST'])
def reset_route():
    """Force-resets the entire state of the service to idle."""
    cleanup_resources()
    return jsonify({"success": True, "message": "Service has been reset to idle state."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
