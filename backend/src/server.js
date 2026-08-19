const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const authRouter = require('./routes/auth');
const tablesRouter = require('./routes/tables');
const path = require('path');
const platsRouter = require('./routes/plats');
const commandesRouter = require('./routes/commandes');
const categoriesRouter = require('./routes/categories');
const abonnementRouter = require('./routes/abonnement');
const superadminRouter = require('./routes/superadmin');
const parrainRouter = require('./routes/parrain');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.set('io', io);

app.get('/', (req, res) => {
  res.send('API restaurant-app en ligne');
});

app.use('/plats', platsRouter);
app.use('/commandes', commandesRouter);
app.use('/auth', authRouter);
app.use('/tables', tablesRouter);
app.use('/categories', categoriesRouter);
app.use('/abonnement', abonnementRouter);
app.use('/superadmin', superadminRouter);
app.use('/parrain', parrainRouter);

io.on('connection', (socket) => {
  console.log('Un client est connecté via WebSocket, id :', socket.id);

  socket.on('rejoindre_restaurant', (restaurantId) => {
    socket.join('restaurant_' + restaurantId);
  });

  socket.on('disconnect', () => {
    console.log('Client déconnecté, id :', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('Serveur démarré sur http://localhost:' + PORT);
});