# TASKFLOW — Real-Time Premium Task Manager

A minimalistic, high-performance productivity dashboard built with **Node.js**, **Express.js**, and the built-in **File System (`fs`)** module.

Inspired by the visual design language of **Apple**, **Linear**, **Notion**, and **Raycast**, TaskFlow operates with **zero fake data** and relies on the server's filesystem as the single source of truth. Every card, metric, widget, and detail view is derived directly from individual plain text files in `/tasks`.

---

## Key Features

- **Zero Fake Data**: No mock tasks, hardcoded stats, or sample users. When `/tasks` is empty, all metrics display `0` alongside a clean empty workspace state.
- **Pure Filesystem Architecture**: Tasks are persisted as UTF-8 `.txt` files in `tasks/`.
- **Real-Time Multi-Tab Synchronization (SSE)**: Built-in Server-Sent Events (`GET /events`) notify all open browser tabs instantly whenever a task is created, edited, completed, or deleted without requiring manual page reloads.
- **Default Premium Light Theme**: Warm ivory / off-white palette (`#f7f7f5`), soft shadows, thin borders, glassmorphism panels, and an optional dark mode toggle (stored in `localStorage`).
- **Live System Clock & Dynamic Greetings**: Real-time system clock updating every second with contextual time-of-day greetings.
- **Live Statistics**:
  - Total Tasks
  - Completed
  - Pending
  - High Priority
  - File count
- **Dashboard Widgets**:
  - **Recent Tasks**: Real latest tasks based on actual file creation/modification timestamps.
  - **Upcoming Tasks**: Filtered and sorted by user-specified due dates.
- **Full Task Lifecycle (CRUD)**:
  - **Create**: Add tasks with title, description, priority (High/Medium/Low), category (College/Project/Work/Personal/Other), and due date.
  - **Read**: Deep task inspection view with raw `.txt` file viewer.
  - **Edit**: Edit form that automatically manages file renaming and disk cleanup.
  - **Toggle Completion**: Interactive checkbox toggling `Completed: true / false` in the text file.
  - **Delete**: Modal-confirmed deletion via `fs.unlink()`.
- **Search, Filter & Sort**: Real-time client search (`Ctrl + K` / `Cmd + K`), priority and status filters, and multi-mode sorting (Newest, Oldest, A-Z, Z-A, Due Date).

---

## Technology Stack

- **Backend**: Node.js & Express.js
- **File Storage**: Built-in `fs` & `path` modules
- **Real-Time**: Server-Sent Events (SSE) via native HTTP streams
- **Frontend**: Semantic HTML5, Vanilla CSS3 (Custom Design System, Glassmorphism, CSS Grid), Vanilla JavaScript

---

## Project Structure

```text
VB ASSIGN/
│
├── public/
│   ├── images/
│   │   └── dashboard-bg.svg  # Minimalist ambient background graphic
│   └── style.css             # Premium Light & Dark theme design system
│
├── tasks/
│   └── .gitkeep              # Tasks storage directory for .txt files
│
├── views/
│   ├── index.html            # Main dashboard with live stats, widgets, and SSE sync
│   ├── task.html             # Full task details view with raw UTF-8 inspector
│   ├── edit.html             # Edit form pre-populated with actual task data
│   └── error.html            # Minimalist 404 error page
│
├── .gitignore                # Excludes node_modules/ and .env
├── package.json              # Express dependency and start script
├── README.md                 # Complete documentation and viva guide
└── server.js                 # Express server, SSE broadcaster, and fs operations
```

---

## Installation & Setup

1. **Navigate to the project root:**
   ```bash
   cd "VB ASSIGN"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   *(or `node server.js`)*

4. **Open in your browser:**
   ```text
   http://localhost:9000
   ```

---

## Express Routes & API Endpoints

| HTTP Method | Route Endpoint | Purpose | Key Concept / fs Method |
| :--- | :--- | :--- | :--- |
| **GET** | `/` | Renders the dashboard with live stats, widgets, and cards | `fs.readdir()`, `fs.readFile()`, `fs.stat()` |
| **POST** | `/create` | Saves new task as a `.txt` file and notifies SSE clients | `req.body`, `fs.writeFile()` |
| **GET** | `/task/:filename` | Displays full task details and raw `.txt` file content | `req.params`, `fs.readFile()`, `fs.stat()` |
| **GET** | `/edit/:filename` | Renders edit form pre-filled with task data | `req.params`, `fs.readFile()` |
| **POST** | `/edit/:filename` | Updates task text, handles file renaming & unlinking | `req.body`, `fs.writeFile()`, `fs.unlink()` |
| **POST** | `/complete/:filename` | Toggles `Completed: true/false` status in `.txt` file | `req.params`, `fs.readFile()`, `fs.writeFile()` |
| **POST** | `/delete/:filename` | Deletes `.txt` task file from disk and notifies SSE | `req.params`, `fs.unlink()` |
| **GET** | `/events` | Server-Sent Events stream for real-time multi-tab sync | Native HTTP stream (`text/event-stream`) |
| **GET** | `/api/tasks` | Returns JSON array of live tasks directly from disk | `fs.readdir()`, `fs.readFile()`, `fs.stat()` |

---

## Task File Format (`.txt`)

Tasks are stored on disk inside `tasks/` in this plain-text format:

```text
Title: Complete Node Assignment

Description:
Finish the Express.js Task Manager assignment.

Priority: High
Category: College
Due Date: 2026-10-10
Completed: false
Created At: 2026-10-03T22:30:00.000Z
```

---

## College Viva / Educational Guide

### 1. What is `req.body` and how does it work?
`req.body` contains key-value pairs submitted by the client in an HTTP `POST` request (such as HTML form data). In Express, `req.body` is parsed using:
```javascript
app.use(express.urlencoded({ extended: true }));
```

### 2. What is `req.params`?
`req.params` contains route parameters defined in the path with a colon (e.g., `/task/:filename` or `/delete/:filename`). When a request is sent to `/task/Node-Assignment.txt`, `req.params.filename` contains `"Node-Assignment.txt"`.

### 3. How do the File System (`fs`) methods work?
- **`fs.writeFile(path, data, callback)`**: Writes task data to disk, creating or replacing the `.txt` file.
- **`fs.readdir(path, callback)`**: Reads the contents of `/tasks` and returns an array of filenames.
- **`fs.readFile(path, 'utf8', callback)`**: Reads the complete string content of a `.txt` file.
- **`fs.unlink(path, callback)`**: Deletes a `.txt` file from the disk.
- **`fs.stat(path, callback)`**: Retrieves file metadata (birthtime, mtime) to calculate timestamps and sorting order.

### 4. How does Real-Time SSE (Server-Sent Events) work?
- `GET /events` opens a persistent HTTP connection (`text/event-stream`).
- When any task modification occurs (`CREATE`, `EDIT`, `DELETE`, `COMPLETE`), `broadcastUpdate()` pushes an event payload (`data: {"type":"UPDATE"}\n\n`) to all connected browser tabs.
- Each client's `EventSource` receives the signal and updates its dashboard metrics and cards asynchronously without a full page refresh.

### 5. How is file security ensured?
- `path.basename(req.params.filename)` prevents directory traversal attacks (`../../`).
- Input sanitization (`sanitizeFilename`) strips illegal filesystem characters (`/ \ : * ? " < > |`) before creating files.

---

## Git & GitHub Commands

```bash
git init
git add .
git commit -m "feat: real-time premium light UI upgrade with zero fake data and SSE sync"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```
