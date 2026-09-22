# Binaire_Freznel_Assessment

A high-performance, real-time multi-user CSV processing queue system. This project consists of a React (Vite) frontend with an enterprise-grade SaaS dashboard and a Node.js/Express backend that utilizes `worker_threads` for heavy computational tasks (All-Reduce operations).

## 🚀 How to Start the App Locally

You will need two terminal windows to run both the frontend and the backend simultaneously.

### 1. Start the Backend (Node.js/Express)
```bash
cd server
npm install
node server.js
```
The backend will start on `http://localhost:3001` (by default).

### 2. Start the Frontend (React/Vite)
```bash
cd client
npm install
npm run dev
```
The frontend will start on `http://localhost:5173`. Open this URL in your web browser.

---

## 🏗️ Object-Oriented Architecture (OOP)

The backend queueing system is strictly modeled using Object-Oriented Programming (OOP) principles to ensure clean boundaries, maintainability, and scalability.

*   **`Task` Class**: Represents a single CSV processing job. It encapsulates all properties associated with a file (e.g., `processId`, `filePath`, `userId`, `priority`, `status`, `progress`, `result`, and `createdAt`). This ensures that state is self-contained.
*   **`QueueManager` Class**: The central conductor of the system. It is responsible for:
    *   **Priority Queueing**: Sorting incoming `Task` instances based on their `priority` property (`'high'` vs `'low'`), ensuring high-priority tasks bypass low-priority ones.
    *   **Resource Allocation**: Delegating actual file processing to a separate thread via `processNext()`.
    *   **State Broadcasting**: Emitting real-time state changes (`queue_update`) via WebSockets to all connected clients, allowing the global dashboard to stay synchronized.

---

## 🛡️ Deadlock Prevention Strategies

In a single-queue architecture handling intense file I/O operations, one malicious or malformed file can lock the entire event loop, starving all other users (Application-Level Deadlock). To prevent this, two robust strategies were implemented:

1.  **Hard Worker Timeouts (Preemption)**: 
    *   When the `QueueManager` offloads a file to a Node.js `worker_thread`, it simultaneously sets a strict 60-second timer (`setTimeout`). 
    *   If the worker thread hangs (due to an infinite loop, massive file size, or silent crash) and fails to emit a completion signal, the `QueueManager` preemptively terminates the thread via `worker.terminate()`. 
    *   This forces the release of the queue lock (`this.isProcessing = false`) and prevents the system from permanently halting.
2.  **Pre-Execution File Validation (Try-Catch)**: 
    *   Inside the worker thread (`worker.js`), synchronous operations like `fs.statSync()` are wrapped in explicit `try-catch` blocks. 
    *   If a file is missing, locked by the OS, or severely malformed, the worker immediately catches the exception and cleanly delegates an `error` message back to the main thread before safely shutting down (`process.exit(1)`). This ensures the worker doesn't silently crash and hang the queue manager waiting for a response.

---

## ☁️ Deployment Configurations

### Frontend Deployment (Vercel)
The React client is configured for seamless deployment on Vercel using the provided `vercel.json`. 
1. Push the repository to GitHub.
2. Import the `client/` folder as a project in Vercel.
3. Vercel will automatically detect Vite and use `npm run build`. 
4. The `vercel.json` rewrites all routing to `index.html` to support React Router natively if added later.

### Backend Deployment (Render)
Because the backend utilizes long-lived WebSocket (`Socket.IO`) connections and background `worker_threads`, serverless environments (like Vercel Serverless Functions) are not viable as they forcefully close connections after 10-60 seconds. 

The backend is configured to be deployed as a Web Service on **Render**. 
1. Use the provided `render.yaml` configuration file.
2. Connect your GitHub repository to Render and create a new "Web Service".
3. Render will automatically install dependencies and keep the Node server running continuously, allowing stable WebSockets and Worker Threads.

*(Note: Remember to update the `http://localhost:3001` hardcoded URL in the React `App.jsx` to your final Render production URL before deploying!)*
