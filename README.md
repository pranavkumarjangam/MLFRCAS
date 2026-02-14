# Multi-Level Face Recognition and Crowd Analysis System (MLFRS)

End-to-end web application for:
- user registration/login (MERN-style backend auth),
- single-face authentication,
- multi-face/group authentication,
- real-time crowd counting from webcam feed.

This project combines a React frontend, a Node.js API server, and Python ML stream services (OpenCV + TensorFlow + MTCNN + FaceNet + YOLO).

## Tech Stack

- Frontend: React (Vite), React Router, Axios
- Backend API: Node.js, Express, MongoDB, JWT, bcrypt
- ML/Streaming Services: Python, Flask, OpenCV, TensorFlow, MTCNN, keras-facenet, Ultralytics YOLO
- Database: MongoDB Atlas (currently configured in backend scripts)

## Repository Structure

```text
.
|-- Backend/
|   |-- server.js                     # Main Node API (port 3001)
|   |-- requirements.txt              # Python ML dependencies
|   |-- single_face_stream.py         # Single-face Flask stream service (port 5002)
|   |-- multi_face_stream.py          # Multi-face Flask stream service (port 5003)
|   |-- face_registration_stream.py   # Face registration stream service (port 5001)
|   |-- crowd_counting_stream.py      # Crowd counting stream service (port 5004)
|   |-- Registration.py               # Legacy registration script
|   |-- Authentication.py             # Legacy authentication script
|
|-- Frontend/
|   |-- src/
|   |   |-- pages/                    # UI screens (auth, capture, camera dashboards)
|   |   |-- components/               # Navbar, ProtectedRoute
|   |-- package.json
|
|-- .gitignore
```

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+
- Python 3.12.x
- Webcam access enabled
- MongoDB Atlas connection available

## Installation

### 1. Clone and enter project

```bash
git clone <your-repo-url>
cd MLFRS
```

### 2. Install frontend dependencies

```bash
cd Frontend
npm install
cd ..
```

### 3. Configure backend environment variables

Create backend env file from template:

```bash
cp Backend/.env.example Backend/.env
```

Then edit `Backend/.env` and set:
- `MONGODB_URI` (required)
- `JWT_SECRET` (required)
- `MONGODB_DB_NAME` (optional, default: `face_recognition`)

### 4. Install backend Node dependencies

```bash
cd Backend
npm install
cd ..
```

### 5. Install backend Python dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r Backend/requirements.txt
```

## Running the Project

You need 2 terminals.

### Terminal A: Node backend API (port 3001)

```bash
cd Backend
npm start
```

### Terminal B: React frontend (Vite)

```bash
cd Frontend
npm run dev
```

Open the frontend URL shown by Vite (usually `http://localhost:5173`).

Note:
- Python stream services are started/stopped by `Backend/server.js` as needed.
- Single-face and multi-face services now use warm/persistent stream servers for better repeated-run performance.

## User Flow

1. Open landing page
2. Sign up (`/signup`)
3. Complete face capture (`/face-capture`)
4. Login (`/login`)
5. Choose dashboard mode:
   - Single Face Authentication
   - Multi-Face Authentication
   - Crowd Counting

## Service Ports

- `3001` Node API (`Backend/server.js`)
- `5001` Face registration stream (`face_registration_stream.py`)
- `5002` Single-face stream (`single_face_stream.py`)
- `5003` Multi-face stream (`multi_face_stream.py`)
- `5004` Crowd-count stream (`crowd_counting_stream.py`)

## Main API Endpoints (Node API)

Base: `http://localhost:3001`

### Auth
- `POST /register`
- `POST /login`
- `POST /forgot-password`

### Face Registration
- `POST /register-face/start`
- `GET /register-face/status`
- `GET /register-face/current-frame`
- `POST /register-face/stop`
- `POST /register-face/complete`

### Face Authentication
- `POST /authenticate-face` (single face)
- `POST /multi-face-auth` (group authentication start)

### Crowd Counting
- `POST /crowd-counting/start`
- `POST /crowd-counting/stop`
- `POST /crowd-counting/force-stop`
- `GET /crowd-counting/status`
- `POST /crowd-counting` (legacy start endpoint)

### Utility
- `GET /recognition-modes`

## Notes on Models and Artifacts

- YOLO weights (`*.pt`) are ignored in Git.
- First run may download model assets and can be slower.
- Runtime/generated files like logs, PID files, and status JSON are ignored by `.gitignore`.

## Current Security/Config Considerations

This project expects secrets in environment variables (loaded from `Backend/.env` in local development):

- `MONGODB_URI`
- `JWT_SECRET`
- `MONGODB_DB_NAME` (optional)
- service host/port config values

For production:
- do not commit `.env`,
- rotate credentials if they were ever committed previously,
- use secret managers/platform env configuration.

