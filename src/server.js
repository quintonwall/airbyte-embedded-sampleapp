require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const api = require('./airbyte_api');
const app = express();
const port = 3000;
const cookieParser = require('cookie-parser');

// Helper function to set authentication cookie
function setAuthCookie(res, email) {
    res.cookie('userEmail', email, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
}

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

// Fake Auth: read user from cookie
app.use((req, res, next) => {
    const userEmail = req.cookies.userEmail;
    if (userEmail) {
        try {
            const user = db.findUser(decodeURIComponent(userEmail));
            if (user) {
                req.user = user;
            }
        } catch (error) {
            console.error('Error reading user from cookie:', error);
        }
    }
    next();
});

// Serve static files from the static directory
app.use(express.static(path.join(__dirname, '../static')));

// Route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../static/index.html'));
});

// Endpoint to handle logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('userEmail', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ message: 'Logged out successfully' });
});

// Endpoint to create a new user
app.post('/api/users', async (req, res) => {
    const { email } = req.body;
    
    // Validate input
    if (!email) {
        console.log(`[/api/users] Status: 400 - Email is required`);
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Check if user already exists
        const existingUser = db.findUser(email);
        if (existingUser) {
            setAuthCookie(res, email);
            console.log(`[/api/users] Status: 200 - Existing user logged in: ${email}`);
            return res.json(existingUser);
        }

        const newUser = db.addUser(email);
        setAuthCookie(res, email);
        console.log(`[/api/users] Status: 201 - New user created: ${email}`);
        res.status(201).json(newUser);
    } catch (error) {
        if (error.message === 'Email already exists') {
            console.log(`[/api/users] Status: 400 - ${error.message}`);
            return res.status(400).json({ error: error.message });
        }
        console.error('Error creating user:', error);
        console.log(`[/api/users] Status: 500 - Failed to create user: ${error.message}`);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Endpoint to get current user information
app.get('/api/users/me', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.user);
});

// Endpoint to generate a widget token that will be passed to the widget in the web app
app.post('/api/airbyte/token', async (req, res) => {
    // Check if user is authenticated
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const widgetToken = await api.generateWidgetToken(req.user.email);
        res.json({ token: widgetToken });
    } catch (error) {
        console.error('Error generating widget token:', error);
        res.status(500).json({ error: 'Failed to generate widget token' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Environment variables loaded:');
    console.log('ALLOWED_ORIGIN:', process.env.ALLOWED_ORIGIN);
    console.log('AIRBYTE_ORGANIZATION_ID:', process.env.AIRBYTE_ORGANIZATION_ID);
    console.log('AIRBYTE_CLIENT_ID:', process.env.AIRBYTE_CLIENT_ID ? '***' : 'not set');
    console.log('AIRBYTE_CLIENT_SECRET:', process.env.AIRBYTE_CLIENT_SECRET ? '***' : 'not set');
    console.log('AWS_ACCESS_KEY:', process.env.AWS_ACCESS_KEY ? '***' : 'not set');
    console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***' : 'not set');
    console.log('S3_BUCKET:', process.env.S3_BUCKET);
    console.log('S3_BUCKET_REGION:', process.env.S3_BUCKET_REGION);
    console.log('S3_BUCKET_PREFIX:', process.env.S3_BUCKET_PREFIX);
});
