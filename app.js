const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Client } = require('pg');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key', // Replace with a secure key for production
    resave: false,
    saveUninitialized: true
}));

// PostgreSQL connection setup
const dbClient = new Client({
  user: 'postgres', // Replace with your PostgreSQL username
  host: 'localhost',
  database: 'photography', // Replace with your database name
  password: 'ismt123', // Replace with your PostgreSQL password
  port: 5432,
});

dbClient.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch((err) => {
    console.error('Database connection error:', err.stack);
    process.exit(1); // Exit if database connection fails
  });

// Ensure the 'uploads' directory exists in 'public'
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // Create if doesn't exist
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Admin credentials (in production, use secure methods like hashing)
const adminUsername = 'admin';
const adminPassword = 'admin123';

// Routes

// Home Page
app.get('/', (req, res) => {
  res.render('home', { title: 'Home' });
});

// About Page
app.get('/about', (req, res) => {
  res.render('about', { title: 'About - Boundless Moments' });
});

// Portfolio Page
app.get('/portfolio', (req, res) => {
  dbClient.query('SELECT * FROM portfolio', (err, result) => {
    if (err) {
      console.error('Error fetching portfolio:', err);
      return res.status(500).send('Error fetching portfolio');
    }
    res.render('portfolio', { title: 'Portfolio', portfolioItems: result.rows });
  });
});

// Gallery Page
app.get('/gallery', (req, res) => {
  const searchQuery = req.query.search || '';
  const sortQuery = req.query.sort || 'caption';

  let query = 'SELECT * FROM gallery WHERE caption ILIKE $1';
  let queryParams = [`%${searchQuery}%`];

  if (sortQuery === 'date') query += ' ORDER BY created_at DESC';
  else query += ' ORDER BY caption ASC';

  dbClient.query(query, queryParams, (err, result) => {
    if (err) {
      console.error('Error fetching gallery:', err);
      return res.status(500).send('Error fetching gallery');
    }
    res.render('gallery', {
      title: 'Gallery',
      galleryImages: result.rows,
      searchQuery,
      sortQuery,
    });
  });
});

// Experience Page
app.get('/experience', (req, res) => {
  dbClient.query('SELECT * FROM experience', (err, result) => {
    if (err) {
      console.error('Error fetching experience:', err);
      return res.status(500).send('Error fetching experience');
    }
    res.render('experience', { title: 'Experience', experienceItems: result.rows });
  });
});

// Contact Page
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact' });
});

// Handle Contact Form Submission
app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  dbClient.query(
    'INSERT INTO messages (name, email, message) VALUES ($1, $2, $3)',
    [name, email, message],
    (err) => {
      if (err) {
        console.error('Error saving message:', err);
        return res.status(500).send('Error saving message');
      }
      res.redirect('/');
    }
  );
});

// Admin Login Page
app.get('/admin/login', (req, res) => {
  res.render('login', { title: 'Admin Login', error: null });
});

// Admin Login Authentication
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === adminUsername && password === adminPassword) {
    req.session.isAuthenticated = true;
    res.redirect('/admin');
  } else {
    res.render('login', { title: 'Admin Login', error: 'Invalid username or password' });
  }
});

// Admin Panel (Only accessible if authenticated)
app.get('/admin', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/admin/login');
  }

  const queries = [
    dbClient.query('SELECT * FROM portfolio'),
    dbClient.query('SELECT * FROM gallery'),
    dbClient.query('SELECT * FROM messages'),
    dbClient.query('SELECT * FROM experience'),
  ];

  Promise.all(queries)
    .then(([portfolioResult, galleryResult, messagesResult, experienceResult]) => {
      res.render('admin', {
        title: 'Admin Panel',
        portfolioItems: portfolioResult.rows,
        galleryImages: galleryResult.rows,
        messages: messagesResult.rows,
        experienceItems: experienceResult.rows,
      });
    })
    .catch((err) => {
      console.error('Error loading admin data:', err);
      res.status(500).send('Error loading admin data');
    });
});

// Admin Add Portfolio Item
app.post('/admin/portfolio/add', upload.single('image'), (req, res) => {
  const { title, description } = req.body;
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;

  if (!imagePath) return res.status(400).send('No file uploaded');

  dbClient.query(
    'INSERT INTO portfolio (title, description, imagePath) VALUES ($1, $2, $3)',
    [title, description, imagePath],
    (err) => {
      if (err) {
        console.error('Error adding portfolio item:', err);
        return res.status(500).send('Error adding portfolio item');
      }
      res.redirect('/admin');
    }
  );
});

// Admin Panel to Delete Portfolio Item
app.post('/admin/portfolio/delete', (req, res) => {
  const { id } = req.body;

  dbClient.query('DELETE FROM portfolio WHERE id = $1', [id], (err) => {
    if (err) {
      console.error('Error deleting portfolio item:', err);
      return res.status(500).send('Error deleting portfolio item');
    }
    res.redirect('/admin');
  });
});


//add experience
app.post('/admin/experience/add', (req, res) => {
  const { title, description, skills, awards } = req.body;

  // Convert comma-separated strings to arrays
  const skillsArray = skills.split(',').map(skill => skill.trim());
  const awardsArray = awards.split(',').map(award => award.trim());

  dbClient.query(
    'INSERT INTO experience (title, description, skills, awards) VALUES ($1, $2, $3, $4)',
    [title, description, skillsArray, awardsArray],
    (err) => {
      if (err) {
        console.error('Error adding experience:', err);
        return res.status(500).send('Error adding experience');
      }
      res.redirect('/admin');
    }
  );
});

//delete experience
app.post('/admin/experience/delete', (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).send('Experience ID is required');
  }

  dbClient.query('DELETE FROM experience WHERE id = $1', [id], (err) => {
    if (err) {
      console.error('Error deleting experience:', err);
      return res.status(500).send('Error deleting experience');
    }
    res.redirect('/admin');
  });
});


// Admin Panel to Delete Messages
app.post('/admin/messages/delete/:id', (req, res) => {
  const messageId = parseInt(req.params.id, 10);

  dbClient.query('DELETE FROM messages WHERE id = $1', [messageId], (err) => {
    if (err) {
      console.error('Error deleting message:', err);
      return res.status(500).send('Error deleting message');
    }
    res.redirect('/admin');
  });
});


// Admin Panel to Add Image to Gallery
app.post('/admin/gallery/add', upload.single('image'), (req, res) => {
  const { caption } = req.body;
  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).send("No file uploaded");
  }
  const imagePath = '/uploads/' + req.file.filename; // Path to the uploaded image

  dbClient.query('INSERT INTO gallery (caption, imagePath) VALUES ($1, $2)', [caption, imagePath], (err) => {
    if (err) {
      console.error('Error adding image to gallery:', err);
      return res.status(500).send('Error adding image to gallery');
    }
    res.redirect('/admin');
  });
});

// Admin Panel to Delete Image from Gallery
app.post('/admin/gallery/delete/:id', (req, res) => {
  const imageId = parseInt(req.params.id, 10);

  dbClient.query('DELETE FROM gallery WHERE id = $1', [imageId], (err) => {
    if (err) {
      console.error('Error deleting image from gallery:', err);
      return res.status(500).send('Error deleting image');
    }
    res.redirect('/admin');
  });
});

// They follow similar patterns with `dbClient.query` and proper error handling

// Admin Logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('Error logging out');
    res.redirect('/admin/login');
  });
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
