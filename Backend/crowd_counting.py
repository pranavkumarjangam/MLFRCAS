from ultralytics import YOLO
import cv2
import numpy as np
from ultralytics import YOLO
import time
import threading
import json
import os
import signal
import psutil
import base64
from flask import Flask, Response, jsonify
from flask_cors import CORS
import io

# Global variables for controlling the counting process
counting_active = False
current_count = 0
max_count = 0
counting_thread = None
stop_flag = threading.Event()
cap = None
yolo_model = None
process_pid = None
current_frame = None
frame_lock = threading.Lock()

# Flask app for streaming
app = Flask(__name__)
CORS(app)

def update_status_file(status, current=0, maximum=0, message=""):
    """Update status file for frontend communication"""
    status_data = {
        "status": status,
        "current_count": current,
        "max_count": maximum,
        "message": message,
        "timestamp": time.time()
    }
    try:
        with open('crowd_status.json', 'w') as f:
            json.dump(status_data, f)
    except Exception as e:
        print(f"Error updating status file: {e}")

def count_crowd_continuous():
    """Continuous crowd counting in a separate thread"""
    global current_count, max_count, stop_flag, cap, yolo_model, counting_active, process_pid
    
    try:
        print("Loading YOLO model...")
        yolo_model = YOLO('yolov8x.pt')
        print("YOLO model loaded successfully")
        
        print("Opening webcam...")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("Failed to open webcam")
            update_status_file("error", message="Cannot open webcam")
            counting_active = False
            return
        
        print("Webcam opened successfully")
        max_count = 0
        current_count = 0
        update_status_file("running", 0, 0, "Crowd counting started")
        print("Starting crowd counting. Monitoring for stop signal...")
        
        # Store process PID for force killing if needed
        process_pid = os.getpid()
        
        frame_count = 0
        while not stop_flag.is_set() and counting_active:
            ret, img = cap.read()
            if not ret:
                print("Failed to read frame")
                time.sleep(0.1)
                continue
            
            frame_count += 1
            
            try:
                # Perform YOLO detection
                yolo_results = yolo_model(img)
                current_count = 0
                
                # Draw bounding boxes for persons detected
                if yolo_results and len(yolo_results) > 0 and yolo_results[0].boxes is not None:
                    for result in yolo_results[0].boxes:
                        class_id = int(result.cls[0])
                        if class_id == 0:  # Class ID 0 corresponds to 'person' in YOLO
                            current_count += 1
                            x1, y1, x2, y2 = map(int, result.xyxy[0])
                            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv2.putText(img, "Person", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                
                # Update max crowd count
                if current_count > max_count:
                    max_count = current_count
                
                # Display count on frame
                cv2.putText(img, f"Current: {current_count} | Max: {max_count}", 
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
                cv2.putText(img, "Press ESC to stop | Use Stop button in UI", 
                           (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                cv2.putText(img, f"Frame: {frame_count}", 
                           (10, img.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                # Display the frame
                cv2.imshow("Crowd Counting - Live Feed", img)
                
                # Update status file with current counts (every 10 frames to reduce I/O)
                if frame_count % 10 == 0:
                    update_status_file("running", current_count, max_count, "Counting in progress")
                
                # Check for ESC key or stop signal
                key = cv2.waitKey(1) & 0xFF
                if key == 27:  # ESC key
                    print("ESC key pressed, stopping...")
                    break
                
                # Additional check for stop flag
                if stop_flag.is_set():
                    print("Stop flag detected, breaking...")
                    break
                    
            except Exception as detection_error:
                print(f"Detection error: {detection_error}")
                continue
        
        print("Stopping crowd counting...")
        
    except Exception as e:
        print(f"Error in crowd counting: {str(e)}")
        update_status_file("error", message=f"Error in crowd counting: {str(e)}")
    finally:
        # Always cleanup resources
        print("Cleaning up resources in finally block...")
        cleanup_resources()
        force_kill_opencv_windows()
        counting_active = False
        process_pid = None
        update_status_file("completed", current_count, max_count, 
                          f"Crowd counting completed. Maximum people detected: {max_count}")
        print(f"Crowd counting completed. Maximum people detected: {max_count}")

def cleanup_resources():
    """Clean up camera and OpenCV resources"""
    global cap
    try:
        if cap is not None:
            cap.release()
            cap = None
        
        # Force close all OpenCV windows multiple times
        for i in range(5):
            cv2.destroyAllWindows()
            cv2.waitKey(1)
            time.sleep(0.1)
        
        print("Resources cleaned up")
    except Exception as e:
        print(f"Error during cleanup: {e}")

def force_kill_opencv_windows():
    """Force kill any remaining OpenCV windows"""
    try:
        # Try multiple methods to close OpenCV windows
        cv2.destroyAllWindows()
        cv2.waitKey(1)
        
        # On Windows, try to kill any opencv processes
        import subprocess
        try:
            subprocess.run(['taskkill', '/f', '/im', 'opencv*'], 
                         capture_output=True, timeout=5)
        except:
            pass
            
    except Exception as e:
        print(f"Error force killing windows: {e}")

def start_counting():
    """Start crowd counting in a separate thread"""
    global counting_active, counting_thread, stop_flag
    
    if counting_active:
        print("Counting is already active")
        return False
    
    try:
        # Clean up any previous resources
        cleanup_resources()
        
        stop_flag.clear()
        counting_active = True
        
        counting_thread = threading.Thread(target=count_crowd_continuous)
        counting_thread.daemon = True
        counting_thread.start()
        
        # Wait a moment to see if thread started successfully
        time.sleep(1)
        
        if counting_thread.is_alive():
            print("Crowd counting started successfully")
            return True
        else:
            counting_active = False
            print("Failed to start counting thread")
            return False
            
    except Exception as e:
        counting_active = False
        print(f"Error starting counting: {e}")
        return False

def stop_counting():
    """Stop crowd counting"""
    global counting_active, counting_thread, stop_flag, process_pid
    
    print("Stop counting requested...")
    
    if not counting_active:
        print("Counting is not active")
        cleanup_resources()  # Clean up anyway
        force_kill_opencv_windows()
        update_status_file("stopped", current_count, max_count, "Counting was not active")
        return True
    
    try:
        # Set stop flag immediately
        stop_flag.set()
        counting_active = False
        
        print("Stopping counting thread...")
        
        # Force close OpenCV windows immediately
        force_kill_opencv_windows()
        
        # Wait for thread to finish with shorter timeout
        if counting_thread and counting_thread.is_alive():
            print("Waiting for thread to finish...")
            counting_thread.join(timeout=3)  # Shorter timeout
            
            if counting_thread.is_alive():
                print("Warning: Thread did not stop gracefully, forcing cleanup")
                # Force cleanup anyway
                cleanup_resources()
                force_kill_opencv_windows()
        
        # Additional cleanup
        cleanup_resources()
        force_kill_opencv_windows()
        
        # Reset process PID
        process_pid = None
        
        update_status_file("stopped", current_count, max_count, "Counting stopped by user")
        print("Crowd counting stopped successfully")
        return True
        
    except Exception as e:
        print(f"Error stopping counting: {e}")
        # Force cleanup anyway
        cleanup_resources()
        force_kill_opencv_windows()
        counting_active = False
        process_pid = None
        update_status_file("error", current_count, max_count, f"Error stopping: {str(e)}")
        return False

def get_status():
    """Get current counting status"""
    try:
        if os.path.exists('crowd_status.json'):
            with open('crowd_status.json', 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error reading status file: {e}")
    
    return {
        "status": "idle",
        "current_count": 0,
        "max_count": 0,
        "message": "Ready to start counting",
        "timestamp": time.time()
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python crowd_counting.py <command>")
        print("Commands: start, stop, status")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "start":
        if start_counting():
            print("Crowd counting started successfully!")
            # Keep the main thread alive while counting
            try:
                while counting_active:
                    time.sleep(1)
            except KeyboardInterrupt:
                stop_counting()
            sys.exit(0)
        else:
            print("Failed to start crowd counting")
            sys.exit(1)
    
    elif command == "stop":
        if stop_counting():
            print("Crowd counting stopped successfully!")
            sys.exit(0)
        else:
            print("Failed to stop crowd counting")
            sys.exit(1)
    
    elif command == "status":
        status = get_status()
        print(json.dumps(status, indent=2))
        sys.exit(0)
    
    else:
        print(f"Unknown command: {command}")
        print("Commands: start, stop, status")
        sys.exit(1)
