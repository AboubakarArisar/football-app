const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Tournament Schema
const tournamentSchema = new mongoose.Schema({
  creator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['draft', 'active', 'finished'],
    default: 'draft'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  started_at: Date,
  finished_at: Date
});

// Match Schema
const matchSchema = new mongoose.Schema({
  tournament_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament',
    required: true
  },
  home_team: {
    type: String,
    required: true
  },
  away_team: {
    type: String,
    required: true
  },
  home_score: {
    type: Number,
    default: 0
  },
  away_score: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['not_started', 'first_half', 'half_time', 'second_half', 'finished', 'paused'],
    default: 'not_started'
  },
  current_half: {
    type: Number,
    default: 1
  },
  timer: {
    type: Number,
    default: 0
  },
  half_duration: {
    type: Number,
    default: 300
  },
  extra_time: {
    type: Number,
    default: 0
  },
  is_paused: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  started_at: Date,
  finished_at: Date
});

// Create models
const User = mongoose.model('User', userSchema);
const Tournament = mongoose.model('Tournament', tournamentSchema);
const Match = mongoose.model('Match', matchSchema);

// User functions
const users = {
  create: async (username, email, password) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
      const user = new User({ username, email, password: hashedPassword });
      await user.save();
      return {
        id: user._id,
        username: user.username,
        email: user.email
      };
    } catch (error) {
      throw new Error(error.message);
    }
  },

  findByUsername: async (username) => {
    return await User.findOne({ username });
  },

  findById: async (id) => {
    return await User.findById(id).select('-password');
  },

  verifyPassword: (hashedPassword, plainPassword) => {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  }
};

// Tournament functions
const tournaments = {
  create: async (creatorId, name, description) => {
    const tournament = new Tournament({
      creator_id: creatorId,
      name,
      description
    });
    await tournament.save();
    return tournament._id;
  },

  findById: async (id) => {
    return await Tournament.findById(id);
  },

  findByCreator: async (creatorId) => {
    return await Tournament.find({ creator_id: creatorId }).sort({ created_at: -1 });
  },

  findAll: async () => {
    return await Tournament.find({ status: 'active' }).sort({ created_at: -1 });
  },

  update: async (id, updates) => {
    const allowedFields = ['name', 'description', 'status', 'started_at', 'finished_at'];
    const filteredUpdates = {};
    
    for (const field of allowedFields) {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    }

    await Tournament.findByIdAndUpdate(id, filteredUpdates);
    return await Tournament.findById(id);
  },

  delete: async (id) => {
    await Tournament.findByIdAndDelete(id);
  }
};

// Match functions
const matches = {
  create: async (tournamentId, homeTeam, awayTeam, halfDuration = 300) => {
    const match = new Match({
      tournament_id: tournamentId,
      home_team: homeTeam,
      away_team: awayTeam,
      half_duration: halfDuration
    });
    await match.save();
    return match._id;
  },

  findById: async (id) => {
    return await Match.findById(id);
  },

  findByTournament: async (tournamentId) => {
    return await Match.find({ tournament_id: tournamentId }).sort({ created_at: -1 });
  },

  findActiveTournaments: async () => {
    return await Match.aggregate([
      {
        $match: {
          status: { $in: ['first_half', 'second_half', 'paused'] }
        }
      },
      {
        $group: {
          _id: '$tournament_id'
        }
      },
      {
        $lookup: {
          from: 'tournaments',
          localField: '_id',
          foreignField: '_id',
          as: 'tournament'
        }
      }
    ]);
  },

  update: async (id, updates) => {
    const allowedFields = ['home_score', 'away_score', 'status', 'current_half', 'timer', 'extra_time', 'is_paused', 'started_at', 'finished_at'];
    const filteredUpdates = {};
    
    for (const field of allowedFields) {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    }

    await Match.findByIdAndUpdate(id, filteredUpdates);
    return await Match.findById(id);
  },

  delete: async (id) => {
    await Match.findByIdAndDelete(id);
  }
};

module.exports = {
  connectDB,
  users,
  tournaments,
  matches,
  User,
  Tournament,
  Match
};
