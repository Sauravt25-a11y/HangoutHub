import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  picture: {
    type: String
  },
  displayName: {
    type: String
  },
  givenName: {
    type: String
  },
  familyName: {
    type: String
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  preferences: {
    theme: { type: String, default: 'dark' },
    notifications: { type: Boolean, default: true },
    autoJoinAudio: { type: Boolean, default: true },
    autoJoinVideo: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    picture: this.picture,
    displayName: this.displayName
  };
};

export default mongoose.model('User', userSchema);