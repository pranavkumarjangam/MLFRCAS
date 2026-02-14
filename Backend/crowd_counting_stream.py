import cv2
import numpy as np
from ultralytics import YOLO
import time
import threading
import json
import os
import base64
from flask import Flask, Response, jsonify
from flask_cors import CORS
import sys
import atexit

# Global variables for controlling the counting process
counting_active = False
current_count = 0
max_count = 0
counting_thread = None
stop_flag = threading.Event()
cap = None
yolo_model = None
current_frame = None
frame_lock = threading.Lock()
PID_FILE = os.path.join(os.path.dirname(__file__), 'crowd_counting_stream.pid')

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
    global current_count, max_count, stop_flag, cap, yolo_model, counting_active, current_frame
    
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
                cv2.putText(img, f"Frame: {frame_count}", 
                           (10, img.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                # Store frame for streaming instead of displaying in OpenCV window
                with frame_lock:
                    # Encode frame as JPEG
                    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    current_frame = base64.b64encode(buffer).decode('utf-8')
                
                # Update status file with current counts (every 10 frames to reduce I/O)
                if frame_count % 10 == 0:
                    update_status_file("running", current_count, max_count, "Counting in progress")
                
                # Check for stop signal
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
        counting_active = False
        update_status_file("completed", current_count, max_count, 
                          f"Crowd counting completed. Maximum people detected: {max_count}")
        print(f"Crowd counting completed. Maximum people detected: {max_count}")

def cleanup_resources():
    """Clean up camera resources"""
    global cap, current_frame
    try:
        if cap is not None:
            cap.release()
            cap = None
        
        # Clear current frame
        with frame_lock:
            current_frame = None
        
        print("Resources cleaned up")
    except Exception as e:
        print(f"Error during cleanup: {e}")

def write_pid_file():
    try:
        with open(PID_FILE, 'w') as f:
            f.write(str(os.getpid()))
    except Exception as e:
        print(f"Failed to write PID file: {e}")

def remove_pid_file():
    try:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
    except Exception as e:
        print(f"Failed to remove PID file: {e}")

# Flask routes for streaming
@app.route('/stream')
def video_stream():
    """Video streaming route"""
    def generate():
        while counting_active:
            with frame_lock:
                if current_frame is not None:
                    # Convert base64 back to bytes for streaming
                    frame_bytes = base64.b64decode(current_frame)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.1)  # Control frame rate
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/current-frame')
def get_current_frame():
    """Get current frame as base64"""
    with frame_lock:
        if current_frame is not None:
            return jsonify({
                'frame': current_frame,
                'count': current_count,
                'max_count': max_count,
                'active': counting_active
            })
        else:
            return jsonify({'frame': None, 'active': counting_active})

@app.route('/status')
def get_status():
    """Get counting status"""
    return jsonify({
        'active': counting_active,
        'current_count': current_count,
        'max_count': max_count
    })

@app.route('/start', methods=['POST'])
def start_route():
    started = start_counting()
    if started:
        return jsonify({'success': True, 'message': 'Crowd counting started'})
    return jsonify({'success': False, 'message': 'Crowd counting is already running or failed to start'}), 400

@app.route('/stop', methods=['POST'])
def stop_route():
    stopped = stop_counting()
    if stopped:
        return jsonify({'success': True, 'message': 'Crowd counting stopped'})
    return jsonify({'success': False, 'message': 'Failed to stop crowd counting'}), 500

@app.route('/health')
def health_route():
    return jsonify({'ok': True, 'active': counting_active})

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
    global counting_active, counting_thread, stop_flag
    
    print("Stop counting requested...")
    
    if not counting_active:
        print("Counting is not active")
        cleanup_resources()
        update_status_file("stopped", current_count, max_count, "Counting was not active")
        return True
    
    try:
        # Set stop flag immediately
        stop_flag.set()
        counting_active = False
        
        print("Stopping counting thread...")
        
        # Wait for thread to finish with shorter timeout
        if counting_thread and counting_thread.is_alive():
            print("Waiting for thread to finish...")
            counting_thread.join(timeout=3)
            
            if counting_thread.is_alive():
                print("Warning: Thread did not stop gracefully, forcing cleanup")
                cleanup_resources()
        
        # Additional cleanup
        cleanup_resources()
        
        update_status_file("stopped", current_count, max_count, "Counting stopped by user")
        print("Crowd counting stopped successfully")
        return True
        
    except Exception as e:
        print(f"Error stopping counting: {e}")
        # Force cleanup anyway
        cleanup_resources()
        counting_active = False
        update_status_file("error", current_count, max_count, f"Error stopping: {str(e)}")
        return False

if __name__ == "__main__":
    atexit.register(remove_pid_file)
    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "start":
            if start_counting():
                write_pid_file()
                # Start Flask server for streaming
                app.run(host='0.0.0.0', port=5004, debug=False, threaded=True)
            else:
                print("Failed to start counting")
                sys.exit(1)
        elif command == "stop":
            stop_counting()
        elif command == "status":
            # Read status from file and output as JSON
            try:
                with open('crowd_status.json', 'r') as f:
                    status_data = json.load(f)
                print(json.dumps(status_data))
            except FileNotFoundError:
                print(json.dumps({
                    "status": "inactive",
                    "current_count": 0,
                    "max_count": 0,
                    "message": "No active session"
                }))
            except Exception as e:
                print(json.dumps({
                    "status": "error",
                    "current_count": 0,
                    "max_count": 0,
                    "message": f"Error reading status: {str(e)}"
                }))
        else:
            print("Usage: python crowd_counting_stream.py [start|stop|status]")
    else:
        print("Usage: python crowd_counting_stream.py [start|stop|status]")
