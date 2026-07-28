# 🖨 Inkwell Print Shop

A full-stack print shop management app — customers place print orders online, admins manage the queue and track revenue.

## Architecture

```
[GitHub Repository]
       │
       ├──> Frontend (HTML/CSS/JS)  ──> GitHub Pages / Vercel (Free)
       │
       └──> Backend (Node/Express)  ──> Heroku / DigitalOcean ($200 Credit)
              │
              └──> Database (MongoDB) ──> MongoDB Atlas (Free Tier / $50 Credit)
```

## Project Structure

```
xerox/
├── frontend/          # Static frontend
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── backend/           # Express API server
│   ├── server.js
│   ├── config/db.js
│   ├── models/Order.js
│   └── routes/orders.js
├── .gitignore
└── README.md
```

## Quick Start

### 1. Database (MongoDB)

**Option A — Local MongoDB:**
```bash
# Make sure MongoDB is running locally on port 27017
```

**Option B — MongoDB Atlas (Cloud):**
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Get your connection string

### 2. Backend

```bash
cd backend

# Create .env from template
cp .env.example .env

# Edit .env with your MongoDB URI
# MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/inkwell

# Install dependencies
npm install

# Start development server
npm run dev
```

The API will be available at `http://localhost:5000`

### 3. Frontend

Open `frontend/index.html` in your browser, or serve it:

```bash
cd frontend
npx serve .
```

> **Note:** Update `API_BASE` in `frontend/script.js` if your backend runs on a different URL.

## API Endpoints

| Method   | Endpoint             | Description                              |
|----------|----------------------|------------------------------------------|
| `GET`    | `/api/orders`        | List orders (?status=, ?search=, ?limit=)|
| `GET`    | `/api/orders/stats`  | Dashboard stats                          |
| `GET`    | `/api/orders/:id`    | Get single order                         |
| `POST`   | `/api/orders`        | Create new order                         |
| `PATCH`  | `/api/orders/:id`    | Update order                             |
| `DELETE` | `/api/orders/:id`    | Delete order                             |
| `GET`    | `/api/health`        | Health check                             |

## Deployment

### Frontend → GitHub Pages / Vercel
- Push the `frontend/` directory
- Set it as the build output directory
- No build step needed (static files)

### Backend → Heroku / DigitalOcean
- Set environment variable: `MONGO_URI`
- Set environment variable: `PORT` (Heroku sets this automatically)
- Start command: `node server.js`

### Database → MongoDB Atlas
- Free tier: 512MB storage, shared cluster
- Set up network access (allow your backend's IP)
- Create a database user

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MongoDB with Mongoose ODM
- **Styling:** Custom CSS with dark mode support
