import cv2
import numpy as np
import os
from mtcnn import MTCNN
from keras_facenet import FaceNet
import datetime
from pymongo import MongoClient
from env_config import get_required_env

# MongoDB Setup
client = MongoClient(get_required_env("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
users_collection = db['users']

# Initialize FaceNet embedder and MTCNN face detector
embedder = FaceNet()
detector = MTCNN()

def align_face(face, output_size=(160, 160)):
    return cv2.resize(face, output_size)

def save_face_embeddings_to_db(name, email, face_embeddings):
    try:
        # Update existing user with face embeddings
        result = users_collection.update_one(
            {"email": email},
            {"$set": {
                "embeddings": [embedding.tolist() for embedding in face_embeddings],
                "face_updated_at": datetime.datetime.now()
            }}
        )
        if result.matched_count > 0:
            print(f"Face embeddings saved for user: {name}")
        else:
            print(f"User not found: {email}")
            raise Exception(f"User not found: {email}")
    except Exception as e:
        print("Error saving face embeddings to MongoDB:", e)
        raise e

def capture_and_save_multiple_embeddings(name, email, max_images):
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise IOError("Cannot open webcam")

    print(f"Capturing up to {max_images} face embeddings. Press 'q' to stop early.")
    face_embeddings = []

    while len(face_embeddings) < max_images:
        ret, frames = cap.read()
        if not ret:
            continue

        faces = detector.detect_faces(frames)
        if faces:
            for face in faces:
                x1, y1, width, height = face['box']
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = x1 + width, y1 + height
                face_pixels = frames[y1:y2, x1:x2]

                if face_pixels.size == 0:
                    continue

                face_pixels = cv2.cvtColor(face_pixels, cv2.COLOR_BGR2RGB)
                face_pixels = align_face(face_pixels)
                face_pixels = np.expand_dims(face_pixels, axis=0)
                face_embedding = embedder.embeddings(face_pixels)

                if face_embedding is not None and face_embedding.size > 0:
                    face_embeddings.append(face_embedding.flatten())
                    print(f"Captured image {len(face_embeddings)} of {max_images}.")
                    cv2.rectangle(frames, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frames, f"Captured {len(face_embeddings)}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

                    if len(face_embeddings) >= max_images:
                        break

        cv2.imshow('Face Capture', frames)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    if face_embeddings:
        save_face_embeddings_to_db(name, email, face_embeddings)
    else:
        print("No face embeddings captured.")
        raise Exception("No face embeddings captured.")

# Command line arguments from server
import sys

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python Registration.py <name> <email>")
        sys.exit(1)
    
    name = sys.argv[1]
    email = sys.argv[2]
    
    print(f"Starting face registration for: {name}")
    try:
        capture_and_save_multiple_embeddings(name, email, max_images=10)
        print("Face registration completed successfully!")
        sys.exit(0)
    except Exception as e:
        print(f"Face registration failed: {str(e)}")
        sys.exit(1)
