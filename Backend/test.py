from pymongo import MongoClient
import os
import time
from env_config import get_required_env

client = MongoClient(get_required_env("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME", "face_recognition")]
try:
    result = db['attendances'].insert_one({"test": True, "timestamp": time.time()})
    print("Insert successful, id:", result.inserted_id)
except Exception as e:
    print("Insert failed:", e)
