// ==========================================================
// TASKFLOW — REAL-TIME FILE SYSTEM TASK MANAGER
// Academic Assignment: Node.js + Express.js + fs Module
// Real-Time SSE Sync | Zero Fake Data | Port: 9000
// ==========================================================

// Core Node.js and Express Modules
const express = require("express");
const fs = require("fs");
const path = require("path");

// Initialize Express Application
const app = express();
const PORT = 9000;

// Directory Paths
const TASKS_DIR = path.join(__dirname, "tasks");
const VIEWS_DIR = path.join(__dirname, "views");
const PUBLIC_DIR = path.join(__dirname, "public");

// Ensure the tasks directory exists on startup
if (!fs.existsSync(TASKS_DIR)) {
  // CONCEPT: fs.mkdirSync creates the storage directory if not present
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

// ==========================================================
// MIDDLEWARE CONFIGURATION
// ==========================================================

// CONCEPT: express.urlencoded parses incoming HTML form submissions into req.body
app.use(express.urlencoded({ extended: true }));

// CONCEPT: express.json parses JSON payloads from client-side fetch requests
app.use(express.json());

// CONCEPT: express.static serves static assets (CSS, images, icons) from public/
app.use(express.static(PUBLIC_DIR));

// ==========================================================
// REAL-TIME SERVER-SENT EVENTS (SSE) BROADCASTER
// ==========================================================
// Active SSE client connections
const sseClients = new Set();

/**
 * Broadcasts a lightweight real-time event to all connected browser tabs
 * Triggered after CREATE, EDIT, DELETE, COMPLETE, UNCOMPLETE operations.
 */
function broadcastUpdate(payload = { type: "UPDATE" }) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  });
}

// Optional: Filesystem watcher for automatic broadcast if files change directly on disk
try {
  let watchDebounce = null;
  fs.watch(TASKS_DIR, (eventType, filename) => {
    if (filename && filename.endsWith(".txt")) {
      clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        broadcastUpdate({ type: "UPDATE", source: "fs.watch", file: filename });
      }, 150);
    }
  });
} catch (e) {
  console.warn("Filesystem watch notice:", e.message);
}

// ==========================================================
// TASK PARSING & SERIALIZATION HELPERS
// ==========================================================

/**
 * Creates a safe, clean filename from a task title.
 * Prevents illegal characters and path traversal.
 */
function sanitizeFilename(title) {
  const cleanTitle = (title || "")
    .trim()
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .replace(/\s+/g, "-");

  return cleanTitle ? `${cleanTitle}.txt` : `task-${Date.now()}.txt`;
}

/**
 * Parses raw .txt file content into a structured task object.
 * NO fake data: derives all values from the actual text file and filesystem stats.
 */
function parseTaskContent(rawContent, filename, stat = null) {
  const lines = rawContent.split("\n");
  let title = filename.replace(/\.txt$/, "").replace(/-/g, " ");
  let priority = "Medium";
  let category = "College";
  let dueDate = "None";
  let completed = false;
  let createdAt = stat
    ? new Date(stat.birthtime || stat.mtime).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  let inDescription = false;
  const descLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("Title:")) {
      title = trimmed.replace("Title:", "").trim();
      inDescription = false;
    } else if (trimmed.startsWith("Priority:")) {
      priority = trimmed.replace("Priority:", "").trim();
      inDescription = false;
    } else if (trimmed.startsWith("Category:")) {
      category = trimmed.replace("Category:", "").trim();
      inDescription = false;
    } else if (trimmed.startsWith("Due Date:")) {
      dueDate = trimmed.replace("Due Date:", "").trim();
      inDescription = false;
    } else if (trimmed.startsWith("Completed:")) {
      completed = trimmed.replace("Completed:", "").trim().toLowerCase() === "true";
      inDescription = false;
    } else if (trimmed.startsWith("Status:")) {
      completed = trimmed.replace("Status:", "").trim().toLowerCase() === "completed";
      inDescription = false;
    } else if (trimmed.startsWith("Created At:")) {
      const parsedDate = trimmed.replace("Created At:", "").trim();
      if (parsedDate) {
        createdAt = parsedDate.includes("T") ? parsedDate.split("T")[0] : parsedDate;
      }
      inDescription = false;
    } else if (trimmed.startsWith("Description:")) {
      inDescription = true;
    } else if (inDescription) {
      descLines.push(line);
    }
  }

  let description = descLines.join("\n").trim();
  if (!description && rawContent) {
    description = rawContent.replace(/^Title:[^\n]*/i, "").trim();
  }

  return {
    filename,
    title,
    description: description || "No description provided.",
    priority: priority || "Medium",
    category: category || "College",
    dueDate: dueDate || "None",
    completed: Boolean(completed),
    createdAt: createdAt || "Recent",
    rawContent,
    mtimeMs: stat ? stat.mtimeMs : Date.now()
  };
}

/**
 * Formats task data into a clean, human-readable .txt file structure.
 */
function formatTaskFile(title, description, priority = "Medium", category = "College", dueDate = "", completed = false, createdAt = "") {
  const dateStr = createdAt || new Date().toISOString();
  return `Title: ${title.trim()}

Description:
${description.trim()}

Priority: ${priority || "Medium"}
Category: ${category || "College"}
Due Date: ${dueDate || "None"}
Completed: ${completed ? "true" : "false"}
Created At: ${dateStr}
`;
}

/**
 * Asynchronously reads all .txt task files from the tasks/ directory.
 * Key Concepts: fs.readdir(), fs.readFile(), fs.stat()
 */
function getTasks(callback) {
  // CONCEPT: fs.readdir() retrieves all file names in the tasks folder
  fs.readdir(TASKS_DIR, (err, files) => {
    if (err) return callback(err, null);

    // Filter only actual .txt task files (ignore .gitkeep, temp files, etc.)
    const taskFiles = files.filter((f) => f.endsWith(".txt"));
    if (taskFiles.length === 0) {
      return callback(null, []);
    }

    let completedCount = 0;
    const tasks = [];

    taskFiles.forEach((file) => {
      const filePath = path.join(TASKS_DIR, file);

      // CONCEPT: fs.stat() retrieves file metadata (creation, modified times)
      fs.stat(filePath, (statErr, stats) => {
        // CONCEPT: fs.readFile() reads the text file content into memory
        fs.readFile(filePath, "utf8", (readErr, content) => {
          completedCount++;
          if (!readErr) {
            const task = parseTaskContent(content, file, stats || null);
            tasks.push(task);
          }

          if (completedCount === taskFiles.length) {
            // Sort newest first by default
            tasks.sort((a, b) => b.mtimeMs - a.mtimeMs);
            callback(null, tasks);
          }
        });
      });
    });
  });
}

/**
 * Escapes HTML characters to prevent XSS in server templates
 */
function escapeHtml(string) {
  if (typeof string !== "string") return "";
  return string
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================
// EXPRESS ROUTES
// ==========================================================

/**
 * Route: GET /events
 * Purpose: Server-Sent Events (SSE) endpoint for multi-tab real-time sync
 */
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  res.write(`data: ${JSON.stringify({ type: "INIT", message: "SSE connected" })}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

/**
 * Route: GET /
 * Purpose: Render Dashboard with live statistics, widgets, and task cards
 * Key Concepts: fs.readdir(), fs.readFile(), fs.stat()
 */
app.get("/", (req, res) => {
  getTasks((err, tasks) => {
    if (err) {
      console.error("Error reading tasks:", err);
      return res.status(500).send("<h1>500 Server Error</h1><p>Unable to read tasks folder.</p>");
    }

    // Calculate real stats from actual files (0 if empty)
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.completed).length;
    const pendingTasks = totalTasks - completedTasks;
    const highPriorityTasks = tasks.filter((t) => t.priority.toLowerCase() === "high").length;

    // Read index.html template using fs.readFile()
    const indexPath = path.join(VIEWS_DIR, "index.html");
    fs.readFile(indexPath, "utf8", (viewErr, template) => {
      if (viewErr) {
        console.error("Error loading index view:", viewErr);
        return res.status(500).send("Unable to load index view.");
      }

      // Format Error message alert if present
      let errorMessageHtml = "";
      if (req.query.error) {
        errorMessageHtml = `
          <div class="alert alert-error" style="margin-bottom: 24px; padding: 12px 16px; border-radius: 8px; background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger);">
            <span>${escapeHtml(req.query.error)}</span>
          </div>
        `;
      }

      // Build Recent Tasks widget HTML (from actual files)
      let recentTasksHtml = "";
      if (tasks.length === 0) {
        recentTasksHtml = '<div class="widget-empty">No recent tasks</div>';
      } else {
        const recent = tasks.slice(0, 4);
        recentTasksHtml = recent
          .map((t) => {
            const pClass =
              t.priority.toLowerCase() === "high"
                ? "badge-priority-high"
                : t.priority.toLowerCase() === "low"
                ? "badge-priority-low"
                : "badge-priority-medium";
            return `
              <a href="/task/${encodeURIComponent(t.filename)}" class="widget-item">
                <span class="widget-item-title">${escapeHtml(t.title)}</span>
                <div class="widget-item-meta">
                  <span class="badge ${pClass}">${escapeHtml(t.priority)}</span>
                  <span>${escapeHtml(t.createdAt)}</span>
                </div>
              </a>
            `;
          })
          .join("");
      }

      // Build Upcoming Tasks widget HTML (from actual files with due dates)
      let upcomingTasksHtml = "";
      const withDueDate = tasks.filter((t) => t.dueDate && t.dueDate !== "None" && !t.completed);
      if (withDueDate.length === 0) {
        upcomingTasksHtml = '<div class="widget-empty">No upcoming tasks</div>';
      } else {
        const upcoming = withDueDate.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
        upcomingTasksHtml = upcoming
          .map((t) => `
            <a href="/task/${encodeURIComponent(t.filename)}" class="widget-item">
              <span class="widget-item-title">${escapeHtml(t.title)}</span>
              <div class="widget-item-meta">
                <span style="color: var(--accent); font-weight: 500;">Due: ${escapeHtml(t.dueDate)}</span>
                <span class="badge badge-category">${escapeHtml(t.category)}</span>
              </div>
            </a>
          `)
          .join("");
      }

      // Build Task Cards Grid HTML or Empty State
      let taskCardsHtml = "";
      if (tasks.length === 0) {
        taskCardsHtml = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3>Your workspace is clear.</h3>
            <p>No tasks yet. Create your first task to get started.</p>
            <a href="#createSection" class="btn btn-primary btn-sm">+ Create Task</a>
          </div>
        `;
      } else {
        const cards = tasks
          .map((task) => {
            const priorityClass =
              task.priority.toLowerCase() === "high"
                ? "badge-priority-high"
                : task.priority.toLowerCase() === "low"
                ? "badge-priority-low"
                : "badge-priority-medium";

            return `
              <div class="task-card ${task.completed ? "is-completed" : ""}"
                   data-title="${escapeHtml(task.title)}"
                   data-body="${escapeHtml(task.description)}"
                   data-priority="${escapeHtml(task.priority)}"
                   data-category="${escapeHtml(task.category)}"
                   data-status="${task.completed ? "completed" : "pending"}"
                   data-time="${task.mtimeMs}"
                   data-due="${escapeHtml(task.dueDate || "")}">
                <div>
                  <div class="task-card-top">
                    <button type="button" class="toggle-btn ${task.completed ? "completed" : ""}" 
                            title="${task.completed ? "Mark as Pending" : "Mark as Completed"}"
                            onclick="toggleCompleteTask('${escapeHtml(task.filename)}')">
                      ${task.completed ? `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                      ` : `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="9"/>
                        </svg>
                      `}
                    </button>
                    <div class="task-title-area">
                      <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
                    </div>
                  </div>

                  <div class="badges-row">
                    <span class="badge ${priorityClass}">${escapeHtml(task.priority)}</span>
                    <span class="badge badge-category">${escapeHtml(task.category)}</span>
                    ${task.dueDate && task.dueDate !== "None" ? `<span class="badge" style="background: var(--surface-input); color: var(--accent);">Due: ${escapeHtml(task.dueDate)}</span>` : ""}
                  </div>

                  <p class="task-card-body">${escapeHtml(task.description)}</p>
                </div>

                <div class="task-card-footer">
                  <span class="task-date">${escapeHtml(task.createdAt)}</span>
                  <div class="card-actions">
                    <a href="/task/${encodeURIComponent(task.filename)}" class="read-more-btn">Read More</a>
                    <a href="/edit/${encodeURIComponent(task.filename)}" class="btn btn-secondary btn-icon-only btn-sm" title="Edit">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </a>
                    <button type="button" class="btn btn-danger btn-icon-only btn-sm" title="Delete" onclick="openDeleteModal('${escapeHtml(task.filename)}', '${escapeHtml(task.title)}')">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");

        taskCardsHtml = `<div class="tasks-grid">${cards}</div>`;
      }

      // Render placeholders in index.html
      const renderedHtml = template
        .replace(/{{ERROR_MESSAGE}}/g, errorMessageHtml)
        .replace(/{{TOTAL_TASKS}}/g, totalTasks.toString())
        .replace(/{{COMPLETED_TASKS}}/g, completedTasks.toString())
        .replace(/{{PENDING_TASKS}}/g, pendingTasks.toString())
        .replace(/{{HIGH_PRIORITY_TASKS}}/g, highPriorityTasks.toString())
        .replace(/{{FILES_COUNT}}/g, totalTasks.toString())
        .replace(/{{RECENT_TASKS_HTML}}/g, recentTasksHtml)
        .replace(/{{UPCOMING_TASKS_HTML}}/g, upcomingTasksHtml)
        .replace(/{{TASK_CARDS}}/g, taskCardsHtml);

      res.send(renderedHtml);
    });
  });
});

/**
 * Route: POST /create
 * Purpose: Receive form data, save new .txt file using fs.writeFile(), notify SSE clients
 * Key Concepts: req.body, fs.writeFile()
 */
app.post("/create", (req, res) => {
  // CONCEPT: req.body gets fields submitted from form
  const { title, description, priority, category, dueDate } = req.body;

  if (!title || !description || title.trim() === "" || description.trim() === "") {
    if (req.accepts("json") && !req.accepts("html")) {
      return res.status(400).json({ error: "Title and description are required" });
    }
    return res.redirect("/?error=" + encodeURIComponent("Both Title and Description are required!"));
  }

  const filename = sanitizeFilename(title);
  const filePath = path.join(TASKS_DIR, filename);

  const fileContent = formatTaskFile(
    title,
    description,
    priority || "Medium",
    category || "College",
    dueDate || "None",
    false,
    new Date().toISOString()
  );

  // CONCEPT: fs.writeFile() creates and saves the task as an individual .txt file
  fs.writeFile(filePath, fileContent, "utf8", (err) => {
    if (err) {
      console.error("Error saving task:", err);
      return res.status(500).send("Failed to save task to filesystem.");
    }

    console.log(`[Task Created] Saved to: ${filename}`);

    // Broadcast real-time update to all open tabs
    broadcastUpdate({ type: "UPDATE", action: "CREATE", filename });

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ success: true, filename });
    }
    res.redirect("/?toast=created");
  });
});

/**
 * Route: GET /task/:filename
 * Purpose: Display full task details by reading .txt file with fs.readFile()
 * Key Concepts: req.params, fs.readFile(), fs.stat()
 */
app.get("/task/:filename", (req, res) => {
  // CONCEPT: req.params gets the filename from the URL route parameter
  const rawParam = req.params.filename;

  // Security: path.basename prevents path traversal attacks (e.g., ../../)
  const safeFilename = path.basename(rawParam);
  const filePath = path.join(TASKS_DIR, safeFilename);

  const taskViewPath = path.join(VIEWS_DIR, "task.html");
  const errorViewPath = path.join(VIEWS_DIR, "error.html");

  // CONCEPT: fs.stat() checks file info on disk
  fs.stat(filePath, (statErr, stats) => {
    // CONCEPT: fs.readFile() reads the complete contents of the .txt file
    fs.readFile(filePath, "utf8", (err, content) => {
      if (err) {
        console.warn(`[Not Found] ${safeFilename}`);
        return fs.readFile(errorViewPath, "utf8", (errViewErr, errorTemplate) => {
          if (errViewErr) return res.status(404).send("Task not found.");
          const errorHtml = errorTemplate.replace(
            "{{ERROR_MESSAGE}}",
            `The requested task file <code>${escapeHtml(safeFilename)}</code> does not exist on disk.`
          );
          res.status(404).send(errorHtml);
        });
      }

      const task = parseTaskContent(content, safeFilename, stats || null);

      const priorityClass =
        task.priority.toLowerCase() === "high"
          ? "badge-priority-high"
          : task.priority.toLowerCase() === "low"
          ? "badge-priority-low"
          : "badge-priority-medium";

      fs.readFile(taskViewPath, "utf8", (viewErr, viewTemplate) => {
        if (viewErr) return res.status(500).send("Error loading task view template.");

        const renderedHtml = viewTemplate
          .replace(/{{TASK_TITLE}}/g, escapeHtml(task.title))
          .replace(/{{TASK_TITLE_ESCAPED}}/g, escapeHtml(task.title).replace(/'/g, "\\'"))
          .replace(/{{FILE_NAME}}/g, escapeHtml(safeFilename))
          .replace(/{{TASK_PRIORITY}}/g, escapeHtml(task.priority))
          .replace(/{{PRIORITY_BADGE_CLASS}}/g, priorityClass)
          .replace(/{{TASK_CATEGORY}}/g, escapeHtml(task.category))
          .replace(/{{TASK_STATUS_LABEL}}/g, task.completed ? "Completed" : "Pending")
          .replace(/{{STATUS_BG}}/g, task.completed ? "var(--success-bg)" : "var(--warning-bg)")
          .replace(/{{STATUS_COLOR}}/g, task.completed ? "var(--success)" : "var(--warning)")
          .replace(/{{TASK_CREATED_AT}}/g, escapeHtml(task.createdAt))
          .replace(/{{TASK_DUE_DATE}}/g, escapeHtml(task.dueDate))
          .replace(/{{TASK_DESCRIPTION_BODY}}/g, escapeHtml(task.description))
          .replace(/{{TASK_CONTENT}}/g, escapeHtml(content))
          .replace(/{{TOGGLE_ACTION_LABEL}}/g, task.completed ? "Mark as Pending" : "Mark as Completed");

        res.send(renderedHtml);
      });
    });
  });
});

/**
 * Route: GET /edit/:filename
 * Purpose: Render edit form populated with actual file data from fs.readFile()
 * Key Concepts: req.params, fs.readFile()
 */
app.get("/edit/:filename", (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(TASKS_DIR, safeFilename);
  const editViewPath = path.join(VIEWS_DIR, "edit.html");

  // CONCEPT: fs.readFile() reads existing task data to populate edit form
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      return res.status(404).redirect("/?error=" + encodeURIComponent("Task file not found."));
    }

    const task = parseTaskContent(content, safeFilename);

    fs.readFile(editViewPath, "utf8", (viewErr, editTemplate) => {
      if (viewErr) return res.status(500).send("Error loading edit view.");

      const renderedHtml = editTemplate
        .replace(/{{FILE_NAME}}/g, escapeHtml(safeFilename))
        .replace(/{{TASK_TITLE}}/g, escapeHtml(task.title))
        .replace(/{{EDIT_TITLE}}/g, escapeHtml(task.title))
        .replace(/{{EDIT_DESCRIPTION}}/g, escapeHtml(task.description))
        .replace(/{{EDIT_DUE_DATE}}/g, task.dueDate !== "None" ? escapeHtml(task.dueDate) : "")
        .replace(/{{SELECT_CAT_COLLEGE}}/g, task.category.toLowerCase() === "college" ? "selected" : "")
        .replace(/{{SELECT_CAT_PROJECT}}/g, task.category.toLowerCase() === "project" ? "selected" : "")
        .replace(/{{SELECT_CAT_WORK}}/g, task.category.toLowerCase() === "work" ? "selected" : "")
        .replace(/{{SELECT_CAT_PERSONAL}}/g, task.category.toLowerCase() === "personal" ? "selected" : "")
        .replace(/{{SELECT_CAT_OTHER}}/g, task.category.toLowerCase() === "other" ? "selected" : "")
        .replace(/{{SELECT_PRIORITY_LOW}}/g, task.priority.toLowerCase() === "low" ? "selected" : "")
        .replace(/{{SELECT_PRIORITY_MEDIUM}}/g, task.priority.toLowerCase() === "medium" ? "selected" : "")
        .replace(/{{SELECT_PRIORITY_HIGH}}/g, task.priority.toLowerCase() === "high" ? "selected" : "")
        .replace(/{{SELECT_STATUS_PENDING}}/g, !task.completed ? "selected" : "")
        .replace(/{{SELECT_STATUS_COMPLETED}}/g, task.completed ? "selected" : "");

      res.send(renderedHtml);
    });
  });
});

/**
 * Route: POST /edit/:filename
 * Purpose: Update file with fs.writeFile(), handles rename + fs.unlink(), broadcasts SSE update
 * Key Concepts: req.params, req.body, fs.writeFile(), fs.unlink()
 */
app.post("/edit/:filename", (req, res) => {
  const oldFilename = path.basename(req.params.filename);
  const oldFilePath = path.join(TASKS_DIR, oldFilename);

  const { title, description, priority, category, dueDate, completed } = req.body;

  if (!title || !description || title.trim() === "" || description.trim() === "") {
    return res.redirect(`/edit/${encodeURIComponent(oldFilename)}?error=Title and description are required.`);
  }

  const newFilename = sanitizeFilename(title);
  const newFilePath = path.join(TASKS_DIR, newFilename);

  fs.readFile(oldFilePath, "utf8", (readErr, oldContent) => {
    let createdAt = new Date().toISOString();
    if (!readErr) {
      const parsedOld = parseTaskContent(oldContent, oldFilename);
      createdAt = parsedOld.createdAt;
    }

    const isCompleted = String(completed).toLowerCase() === "true";
    const updatedContent = formatTaskFile(
      title,
      description,
      priority || "Medium",
      category || "College",
      dueDate || "None",
      isCompleted,
      createdAt
    );

    // CONCEPT: fs.writeFile() overwrites or creates the new task file
    fs.writeFile(newFilePath, updatedContent, "utf8", (writeErr) => {
      if (writeErr) {
        console.error("Error updating task file:", writeErr);
        return res.status(500).send("Failed to update task file.");
      }

      // If title changed resulting in new filename, delete old file using fs.unlink()
      if (newFilename !== oldFilename) {
        // CONCEPT: fs.unlink() deletes the old file
        fs.unlink(oldFilePath, (unlinkErr) => {
          if (unlinkErr) console.warn("Could not delete old renamed file:", unlinkErr);
          broadcastUpdate({ type: "UPDATE", action: "EDIT", filename: newFilename });
          res.redirect(`/task/${encodeURIComponent(newFilename)}?toast=updated`);
        });
      } else {
        broadcastUpdate({ type: "UPDATE", action: "EDIT", filename: newFilename });
        res.redirect(`/task/${encodeURIComponent(newFilename)}?toast=updated`);
      }
    });
  });
});

/**
 * Route: POST /complete/:filename (and POST /toggle/:filename)
 * Purpose: Toggle completion boolean in .txt file, save with fs.writeFile(), broadcast SSE
 * Key Concepts: req.params, fs.readFile(), fs.writeFile()
 */
function handleToggleComplete(req, res) {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(TASKS_DIR, safeFilename);

  // CONCEPT: fs.readFile() reads current file state
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) return res.status(404).json({ error: "Task not found." });

    const task = parseTaskContent(content, safeFilename);
    const newCompleted = !task.completed;

    const updatedContent = formatTaskFile(
      task.title,
      task.description,
      task.priority,
      task.category,
      task.dueDate,
      newCompleted,
      task.createdAt
    );

    // CONCEPT: fs.writeFile() writes updated status back to disk
    fs.writeFile(filePath, updatedContent, "utf8", (writeErr) => {
      if (writeErr) return res.status(500).json({ error: "Error updating status." });

      broadcastUpdate({ type: "UPDATE", action: "COMPLETE", filename: safeFilename, completed: newCompleted });

      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.json({ success: true, completed: newCompleted });
      }

      const referrer = req.get("Referrer") || "/";
      if (referrer.includes("/task/")) {
        res.redirect(`/task/${encodeURIComponent(safeFilename)}?toast=toggled`);
      } else {
        res.redirect("/?toast=toggled");
      }
    });
  });
}

app.post("/complete/:filename", handleToggleComplete);
app.post("/toggle/:filename", handleToggleComplete);

/**
 * Route: POST /delete/:filename
 * Purpose: Delete task .txt file using fs.unlink(), notify SSE clients
 * Key Concepts: req.params, fs.unlink()
 */
app.post("/delete/:filename", (req, res) => {
  // CONCEPT: req.params extracts the target filename
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(TASKS_DIR, safeFilename);

  // CONCEPT: fs.unlink() permanently deletes the file from filesystem
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Error deleting file:", err);
      return res.status(500).json({ error: "Failed to delete task file." });
    }

    console.log(`[Task Deleted] Removed: ${safeFilename}`);
    broadcastUpdate({ type: "UPDATE", action: "DELETE", filename: safeFilename });

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ success: true, filename: safeFilename });
    }
    res.redirect("/?toast=deleted");
  });
});

/**
 * Route: GET /api/tasks
 * Purpose: Returns real filesystem data in JSON format for real-time frontend synchronization
 * Key Concepts: fs.readdir(), fs.readFile(), fs.stat()
 */
app.get("/api/tasks", (req, res) => {
  getTasks((err, tasks) => {
    if (err) return res.status(500).json({ error: "Failed to read tasks" });
    res.json(tasks);
  });
});

// ==========================================================
// START SERVER
// ==========================================================
const server = app.listen(PORT, () => {
  console.log("==================================================");
  console.log(`⚡ TASKFLOW Server running on port: ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📂 Real filesystem storage: ${TASKS_DIR}`);
  console.log("==================================================");
});

module.exports = { app, server };
