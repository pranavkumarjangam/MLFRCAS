print("=== multi_face_stream.py STARTED ===")
import cv2
import numpy as np
import os
from mtcnn import MTCNN
from keras_facenet import FaceNet
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity
import time
import threading
import base64
from flask import Flask, jsonify
from flask_cors import CORS
from env_config import get_required_env

# Global variables
auth_active = False
auth_thread = None
stop_flag = threading.Event()
cap = None
current_frame = None
frame_lock = threading.Lock()
state_lock = threading.Lock()
auth_result = None
recognized_users = []
session_id = None  # stays fixed per session

# MongoDB Setup
client = MongoClient(get_required_env("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
users_collection = db['users']
attendance_collection = db['attendances']

# Ensure unique session documents
try:
    attendance_collection.create_index([("session_id", 1)], unique=True)
except Exception as e:
    print(f"[Attendance] Failed to create index: {e}")

# Initialize models
embedder = FaceNet()
detector = MTCNN()

# Flask app
app = Flask(__name__)
CORS(app)


def align_face(face, output_size=(160, 160)):
    return cv2.resize(face, output_size)


def _state_snapshot():
    with state_lock:
        return {
            "auth_active": auth_active,
            "auth_result": dict(auth_result) if isinstance(auth_result, dict) else auth_result,
            "recognized_users": list(recognized_users),
            "session_id": session_id
        }


def get_all_user_embeddings():
    """Get all registered users and their embeddings"""
    users = list(users_collection.find({"embeddings": {"$exists": True}}))
    user_data = {}
    for user in users:
        if "embeddings" in user:
            user_data[user["email"]] = {
                "name": user.get("name", "Unknown"),
                "embeddings": [np.array(embedding) for embedding in user["embeddings"]]
            }
    return user_data


def save_attendance_record():
    """Save/update the attendance document for the current session"""
    snapshot = _state_snapshot()
    current_session_id = snapshot["session_id"]
    current_result = snapshot["auth_result"]
    current_users = snapshot["recognized_users"]
    message = current_result.get("message", "") if isinstance(current_result, dict) else ""
    success = bool(current_result and current_result.get("success"))

    if current_session_id is None:
        print("[Attendance] No active session_id, skipping save.")
        return

    try:
        attendance_collection.update_one(
            {"session_id": current_session_id},
            {
                "$set": {
                    "session_id": current_session_id,
                    "timestamp": time.time(),
                    "recognized_users": current_users,
                    "total_recognized": len(current_users),
                    "status": "success" if success else "failed",
                    "message": message
                }
            },
            upsert=True
        )
        print(f"[Attendance] Document saved/updated for session {current_session_id}")
    except Exception as e:
        print(f"[Attendance] Failed to store: {e}")


def add_user_to_session(user):
    """Add user to in-memory and MongoDB document if not already present"""
    global recognized_users, session_id
    should_add = False
    current_session_id = None
    with state_lock:
        if not any(u["email"] == user["email"] for u in recognized_users):
            recognized_users.append(user)
            should_add = True
        current_session_id = session_id
    if should_add:
        try:
            attendance_collection.update_one(
                {"session_id": current_session_id},
                {"$addToSet": {"recognized_users": user}},
                upsert=True
            )
        except Exception as e:
            print(f"[Attendance] Failed to add user: {e}")


def authenticate_multiple_faces(threshold=0.5):
    global auth_active, stop_flag, cap, current_frame, auth_result, recognized_users, session_id
    with state_lock:
        recognized_users.clear()
        auth_result = None

    try:
        user_data = get_all_user_embeddings()
        print(f"[Auth] Found {len(user_data)} registered users in DB")
        if len(user_data) == 0:
            with state_lock:
                auth_result = {
                    "success": False,
                    "message": "No registered users with embeddings found.",
                    "recognized_users": [],
                    "total_recognized": 0,
                    "session_id": session_id
                }
            return

        try:
            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        except Exception:
            cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            with state_lock:
                auth_result = {"success": False, "message": "Cannot open webcam", "session_id": session_id}
            return

        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        for _ in range(5):
            cap.grab()
            time.sleep(0.03)

        start_time = time.time()
        timeout = 30

        while auth_active and not stop_flag.is_set():
            ret, frame = cap.read()
            if not ret:
                continue

            with frame_lock:
                _, buffer = cv2.imencode('.jpg', frame)
                current_frame = base64.b64encode(buffer).decode('utf-8')

            current_time = time.time() - start_time

            if current_time > timeout:
                with state_lock:
                    recognized_count = len(recognized_users)
                    auth_result = {
                        "success": recognized_count > 0,
                        "message": f"Multi-face authentication completed. {recognized_count} users recognized." if recognized_count > 0 else "Authentication timed out. No users recognized.",
                        "recognized_users": list(recognized_users),
                        "total_recognized": recognized_count,
                        "session_id": session_id
                    }
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

                    best_match = None
                    best_similarity = 0
                    for email, user_info in user_data.items():
                        similarities = [cosine_similarity([face_embedding], [stored])[0][0]
                                        for stored in user_info["embeddings"]]
                        max_similarity = max(similarities) if similarities else 0
                        if max_similarity >= threshold and max_similarity > best_similarity:
                            best_similarity = max_similarity
                            best_match = {
                                "email": email,
                                "name": user_info["name"],
                                "similarity": max_similarity
                            }

                    if best_match:
                        add_user_to_session(best_match)

            time.sleep(0.1)

        with state_lock:
            if not auth_result:
                recognized_count = len(recognized_users)
                if recognized_count > 0:
                    auth_result = {
                        "success": True,
                        "message": f"Multi-face authentication completed. {recognized_count} users recognized.",
                        "recognized_users": list(recognized_users),
                        "total_recognized": recognized_count,
                        "session_id": session_id
                    }
                else:
                    auth_result = {
                        "success": False,
                        "message": "Authentication timed out. No users recognized.",
                        "recognized_users": [],
                        "total_recognized": 0,
                        "session_id": session_id
                    }

    except Exception as e:
        with state_lock:
            auth_result = {"success": False, "message": f"Error: {str(e)}", "session_id": session_id}
    finally:
        save_attendance_record()
        with state_lock:
            auth_active = False
        cleanup_resources()


def cleanup_resources():
    global cap, current_frame
    if cap:
        cap.release()
        cap = None
    with frame_lock:
        current_frame = None


def _no_cache_json(payload):
    response = jsonify(payload)
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/current-frame')
def get_current_frame():
    global current_frame, auth_active
    with frame_lock:
        local_frame = current_frame
    with state_lock:
        active = auth_active
        recognized_count = len(recognized_users)
        current_session_id = session_id
    frame_to_send = local_frame if active else None
    return _no_cache_json({
        'frame': frame_to_send,
        'active': active,
        'recognized_count': recognized_count,
        'session_id': current_session_id
    })


@app.route('/status')
def get_status():
    global auth_result, auth_active, recognized_users
    snapshot = _state_snapshot()
    current_result = snapshot["auth_result"]
    current_session_id = snapshot["session_id"]
    current_users = snapshot["recognized_users"]
    active = snapshot["auth_active"]
    if current_result:
        result_with_status = dict(current_result)
        result_with_status.setdefault('status', 'completed' if current_result.get('success') else 'failed')
        result_with_status.setdefault('session_id', current_session_id)
        return _no_cache_json(result_with_status)
    return _no_cache_json({
        "status": "running" if active else "idle",
        "recognized_users": current_users,
        "total_recognized": len(current_users),
        "session_id": current_session_id
    })


@app.route('/stop', methods=['POST'])
def stop_route():
    result = stop_authentication()
    return _no_cache_json(result)


@app.route('/start', methods=['POST'])
def start_route():
    result = start_authentication()
    return _no_cache_json(result)


@app.route('/health')
def health_route():
    with state_lock:
        status = 'running' if auth_active else 'idle'
    return _no_cache_json({'ok': True, 'status': status})


def start_authentication():
    global auth_active, auth_thread, stop_flag, recognized_users, auth_result, current_frame, session_id

    with state_lock:
        if auth_active:
            return {"success": False, "message": "Already running", "session_id": session_id}

        auth_active = True
        stop_flag.clear()
        recognized_users = []
        auth_result = None

        # Generate session_id only once per session
        session_id = int(time.time() * 1000)
    with frame_lock:
        current_frame = None

    auth_thread = threading.Thread(target=authenticate_multiple_faces)
    auth_thread.daemon = True
    auth_thread.start()

    return {"success": True, "message": "Started", "session_id": session_id}


def stop_authentication():
    global auth_active, stop_flag, current_frame, auth_thread, session_id, recognized_users, auth_result
    with state_lock:
        auth_active = False
    stop_flag.set()
    cleanup_resources()
    try:
        if auth_thread and auth_thread.is_alive():
            auth_thread.join(timeout=2.0)
    except Exception:
        pass
    with state_lock:
        if not auth_result:
            recognized_count = len(recognized_users)
            auth_result = {
                "success": recognized_count > 0,
                "message": f"Authentication stopped manually. {recognized_count} users recognized.",
                "recognized_users": list(recognized_users),
                "total_recognized": recognized_count,
                "session_id": session_id
            }
    save_attendance_record()
    return {"success": True, "message": "Stopped", "session_id": session_id}


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5003, debug=False)
