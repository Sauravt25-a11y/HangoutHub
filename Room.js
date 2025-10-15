import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    default: () => Math.random().toString(36).substr(2, 6).toUpperCase()
  },
  hostName: {
    type: String,
    required: true
  },
  hostProfile: {
    name: String
  },
  participants: [{
    id: String,
    name: String,
    joinedAt: { type: Date, default: Date.now }
  }],
  messages: [{
    sender: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  sharedFiles: [{
    id: String,
    originalName: String,
    fileName: String,
    size: Number,
    mimetype: String,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
    downloadUrl: String
  }],
  admissionRequired: {
    type: Boolean,
    default: true
  },
  waitingList: [{
    id: String,
    name: String,
    profile: Object
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Room', roomSchema);