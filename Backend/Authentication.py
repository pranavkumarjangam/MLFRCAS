
import cv2
import numpy as np
import os
from mtcnn import MTCNN
from keras_facenet import FaceNet
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity
from env_config import get_required_env

# MongoDB Setup
client = MongoClient(get_required_env("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
users_collection = db['users']

# Initialize FaceNet embedder and MTCNN face detector
embedder = FaceNet()
detector = MTCNN()

def align_face(face, output_size=(160, 160)):
    """Resize the detected face for embedding."""
    return cv2.resize(face, output_size)

def get_embeddings_from_db(email):
    """Retrieve stored embeddings from MongoDB for a given user."""
    user_data = users_collection.find_one({"email": email})
    if user_data and "embeddings" in user_data:
        return [np.array(embedding) for embedding in user_data['embeddings']]
    else:
        print(f"No embeddings found for user {email}.")
        return None

def authenticate_user(email, threshold=0.5):
    """Authenticate user by comparing live capture embedding with stored embeddings."""
    stored_embeddings = get_embeddings_from_db(email)
    if stored_embeddings is None:
        return False

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise IOError("Cannot open webcam")

    print("Capturing face for authentication. Press 'q' to quit.")
    authenticated = False

    while True:
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
                face_embedding = embedder.embeddings(face_pixels).flatten()

                similarities = [cosine_similarity([face_embedding], [stored])[0][0] for stored in stored_embeddings]
                max_similarity = max(similarities) if similarities else 0

                if max_similarity >= threshold:
                    print(f"Authentication successful for {email}!")
                    authenticated = True
                    break
                else:
                    print(f"Similarity score: {max_similarity:.2f}. Authentication failed.")

                cv2.rectangle(frames, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frames, "Authenticating...", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow('Authentication', frames)
        if cv2.waitKey(1) & 0xFF == ord('q') or authenticated:
            break

    cap.release()
    cv2.destroyAllWindows()

    return authenticated

# Command line arguments from server
import sys

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python Authentication.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    
    print(f"Starting face authentication for: {email}")
    try:
        authenticated = authenticate_user(email, threshold=0.5)
        if authenticated:
            print("Face authentication completed successfully!")
            sys.exit(0)
        else:
            print(f"Authentication failed for {email}.")
            sys.exit(1)
    except Exception as e:
        print(f"Face authentication failed: {str(e)}")
        sys.exit(1)
