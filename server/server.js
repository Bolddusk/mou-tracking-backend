require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const matchmakingRoutes = require('./routes/matchmakingRoutes');
const activityRoutes = require('./routes/activityRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const devRoutes = require('./routes/devRoutes');
const { testConnection, getDbConfig } = require('./config/db');
const { initProposalChat } = require('./socket/proposalChat');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

initProposalChat(server);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', async (req, res) => {
  try {
    const database = await testConnection();
    res.json({ status: 'ok', database });
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'Database unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dev', devRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const database = await testConnection();
    const { host, port } = getDbConfig();
    console.log(`MySQL connected: ${database} @ ${host}:${port}`);
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    console.error('Run: npm run db:init');
  }
});
