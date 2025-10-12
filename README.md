# HangoutHub - Video Conferencing & Chat App

A modern, real-time video conferencing and chat application built with Node.js, Socket.IO, and WebRTC.

## Features

- **Simple Username-Based Authentication** (no Google Auth required)
- **Real-time Video Calling** with WebRTC
- **Text Chat** during video calls
- **Room-based System** with unique room codes
- **Host Admission Control** (like Google Meet)
- **Screen Sharing** capability
- **Responsive Design** with Tailwind CSS
- **Media Controls** (mute/unmute, camera on/off)
- **Participant Management**

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- Modern web browser with WebRTC support

### Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # Copy the example env file
   cp .env.example .env
   
   # Edit .env with your MongoDB connection string
   MONGODB_URL=mongodb://localhost:27017/hangouthub
   PORT=3000
   ```

4. **Create the public directory and move frontend files:**
   ```bash
   mkdir public
   mv index.html public/
   mv app.js public/
   mv style.css public/
   ```

5. **Start the server:**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Open your browser:**
   Navigate to `http://localhost:3000`

## Project Structure

```
hangouthub/
├── server.js          # Main server file
├── Room.js           # MongoDB room model
├── package.json      # Dependencies
├── .env             # Environment variables
├── README.md        # This file
└── public/          # Frontend files
    ├── index.html   # Main HTML file
    ├── app.js       # Client-side JavaScript
    └── style.css    # Styles
```

## How to Use

1. **Enter your name** on the login page
2. **Create a room** or **join an existing room** with a room code
3. **Allow camera/microphone permissions** when prompted
4. **Share the room code** with others to invite them
5. **Use media controls** to mute/unmute, turn camera on/off, or share screen
6. **Chat** with participants using the chat panel

## Deployment

### Deploy to Render.com

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Set environment variables:
   - `MONGODB_URL`: Your MongoDB Atlas connection string
   - `PORT`: 3000 (or leave blank for auto-assignment)
5. Deploy!

### Deploy to Heroku

1. Install Heroku CLI
2. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```
3. Set environment variables:
   ```bash
   heroku config:set MONGODB_URL=your-mongodb-atlas-url
   ```
4. Deploy:
   ```bash
   git push heroku main
   ```

### MongoDB Atlas Setup (for production)

1. Create a free account at [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a new cluster
3. Create a database user
4. Get your connection string
5. Replace `MONGODB_URL` in your environment variables

## Technical Stack

- **Backend:** Node.js, Express, Socket.IO
- **Database:** MongoDB with Mongoose
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Styling:** Tailwind CSS
- **Real-time Communication:** Socket.IO, WebRTC
- **Video/Audio:** WebRTC API

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Security Notes

- This is a demo application with basic username authentication
- For production use, consider adding:
  - Proper user authentication
  - Rate limiting
  - Input validation
  - HTTPS enforcement
  - Security headers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Troubleshooting

### Common Issues

1. **Camera/Microphone not working:**
   - Check browser permissions
   - Ensure HTTPS in production
   - Try refreshing the page

2. **MongoDB connection failed:**
   - Check your connection string
   - Ensure MongoDB is running (local) or accessible (Atlas)
   - Verify network connectivity

3. **Room not found:**
   - Check the room code spelling
   - Ensure the room creator is still connected

4. **Video not loading:**
   - Check WebRTC compatibility
   - Ensure stable internet connection
   - Try different browser

### Support

For issues and questions, check the browser console for error messages and ensure all dependencies are properly installed.

---

**Happy video calling! 🎥📞**