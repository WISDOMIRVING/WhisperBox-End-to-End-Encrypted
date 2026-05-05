import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

// Plugins
fastify.register(cors);
fastify.register(jwt, { secret: 'whisperbox-local-secret-key-123' });
fastify.register(websocket);

// Active connections for real-time messaging
const clients = new Map(); // userId -> socket

// --- Schemas ---
const RegisterSchema = z.object({
  username: z.string().min(3),
  display_name: z.string().min(1),
  password: z.string().min(6),
  public_key: z.string(),
  wrapped_private_key: z.string(),
  pbkdf2_salt: z.string(),
});

// --- Routes ---

// 1. Auth: Register
fastify.post('/auth/register', async (request, reply) => {
  const data = RegisterSchema.parse(request.body);
  
  const existing = await prisma.user.findUnique({ where: { username: data.username.toLowerCase() } });
  if (existing) return reply.status(409).send({ detail: 'Username taken' });

  const password_hash = await bcrypt.hash(data.password, 10);
  
  const user = await prisma.user.create({
    data: {
      username: data.username.toLowerCase(),
      display_name: data.display_name,
      password_hash,
      public_key: data.public_key,
      wrapped_private_key: data.wrapped_private_key,
      pbkdf2_salt: data.pbkdf2_salt,
    }
  });

  const token = fastify.jwt.sign({ id: user.id, username: user.username });
  return reply.status(201).send({ 
    access_token: token, 
    refresh_token: 'refresh-' + token.slice(-20), 
    token_type: 'bearer',
    expires_in: 900,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      public_key: user.public_key,
      wrapped_private_key: user.wrapped_private_key,
      pbkdf2_salt: user.pbkdf2_salt,
      created_at: user.created_at
    }
  });
});

// 2. Auth: Login
fastify.post('/auth/login', async (request, reply) => {
  const { username, password } = request.body;
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return reply.status(401).send({ detail: 'Invalid username or password' });
  }

  const token = fastify.jwt.sign({ id: user.id, username: user.username });
  return { 
    access_token: token, 
    refresh_token: 'refresh-' + token.slice(-20),
    token_type: 'bearer',
    expires_in: 900,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      public_key: user.public_key,
      wrapped_private_key: user.wrapped_private_key,
      pbkdf2_salt: user.pbkdf2_salt,
      created_at: user.created_at
    }
  };
});

// 3. Users: Search
fastify.get('/users/search', {
  onRequest: [async (req, res) => await req.jwtVerify()]
}, async (request) => {
  const { q } = request.query;
  
  if (!q || q.trim().length === 0) {
    // If no query, return some suggested users (e.g., the 15 seeded ones)
    const suggestions = await prisma.user.findMany({
      where: { NOT: { id: request.user.id } },
      take: 15,
      orderBy: { created_at: 'desc' }
    });
    return suggestions.map(u => ({ id: u.id, username: u.username, display_name: u.display_name }));
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: q } },
        { display_name: { contains: q } }
      ],
      NOT: { id: request.user.id }
    },
    take: 20
  });
  return users.map(u => ({ id: u.id, username: u.username, display_name: u.display_name }));
});

// 4. Users: Public Key
fastify.get('/users/:userId/public-key', {
  onRequest: [async (req, res) => await req.jwtVerify()]
}, async (request) => {
  const { userId } = request.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return { public_key: user.public_key };
});

// 5. Messages: Get Conversations
fastify.get('/conversations', {
  onRequest: [async (req, res) => await req.jwtVerify()]
}, async (request) => {
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ from_user_id: request.user.id }, { to_user_id: request.user.id }]
    },
    orderBy: { created_at: 'desc' },
    include: { sender: true, recipient: true }
  });

  const conversationMap = new Map();
  messages.forEach(msg => {
    const otherUser = msg.from_user_id === request.user.id ? msg.recipient : msg.sender;
    if (!conversationMap.has(otherUser.id)) {
      conversationMap.set(otherUser.id, {
        user_id: otherUser.id,
        username: otherUser.username,
        display_name: otherUser.display_name,
        last_message_at: msg.created_at
      });
    }
  });

  return Array.from(conversationMap.values());
});

// 6. Messages: Get Messages
fastify.get('/conversations/:userId/messages', {
  onRequest: [async (req, res) => await req.jwtVerify()]
}, async (request) => {
  const { userId } = request.params;
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { from_user_id: request.user.id, to_user_id: userId },
        { from_user_id: userId, to_user_id: request.user.id }
      ]
    },
    orderBy: { created_at: 'desc' },
    take: 50
  });

  return messages.map(msg => ({
    id: msg.id,
    from_user_id: msg.from_user_id,
    to_user_id: msg.to_user_id,
    payload: {
      ciphertext: msg.ciphertext,
      iv: msg.iv,
      encryptedKey: msg.encrypted_key,
      encryptedKeyForSelf: msg.encrypted_key_for_self
    },
    delivered: msg.delivered,
    created_at: msg.created_at
  }));
});

// 6b. Messages: Send Message (Fallback)
fastify.post('/messages', {
  onRequest: [async (req, res) => await req.jwtVerify()]
}, async (request, reply) => {
  const { to, payload } = request.body;
  
  const savedMsg = await prisma.message.create({
    data: {
      from_user_id: request.user.id,
      to_user_id: to,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      encrypted_key: payload.encryptedKey,
      encrypted_key_for_self: payload.encryptedKeyForSelf,
      delivered: !!clients.get(to)
    }
  });

  // If recipient is online, push via WS as well
  const recipientSocket = clients.get(to);
  if (recipientSocket) {
    recipientSocket.send(JSON.stringify({
      event: 'message.receive',
      id: savedMsg.id,
      from_user_id: request.user.id,
      to_user_id: to,
      payload: payload,
      created_at: savedMsg.created_at
    }));
  }

  return reply.status(201).send({
    id: savedMsg.id,
    from_user_id: request.user.id,
    to_user_id: to,
    payload: payload,
    delivered: savedMsg.delivered,
    created_at: savedMsg.created_at
  });
});

// 7. WebSocket: Real-time
fastify.get('/ws', { websocket: true }, (connection, req) => {
  const token = req.query.token;
  let userId = null;

  try {
    const decoded = fastify.jwt.verify(token);
    userId = decoded.id;
    clients.set(userId, connection.socket);
    fastify.log.info(`User ${userId} connected via WS`);
    broadcastPresence(userId, 'user.online');
  } catch (err) {
    connection.socket.close();
    return;
  }

  connection.socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.event === 'message.send') {
        const { to, payload } = data;
        
        const savedMsg = await prisma.message.create({
          data: {
            from_user_id: userId,
            to_user_id: to,
            ciphertext: payload.ciphertext,
            iv: payload.iv,
            encrypted_key: payload.encryptedKey,
            encrypted_key_for_self: payload.encryptedKeyForSelf,
            delivered: !!clients.get(to)
          }
        });

        const recipientSocket = clients.get(to);
        if (recipientSocket) {
          recipientSocket.send(JSON.stringify({
            event: 'message.receive',
            id: savedMsg.id,
            from_user_id: userId,
            to_user_id: to,
            payload: payload,
            created_at: savedMsg.created_at
          }));
        }
      }
    } catch (err) {
      fastify.log.error(err);
      connection.socket.send(JSON.stringify({ event: 'error', detail: 'Invalid frame format' }));
    }
  });

  connection.socket.on('close', () => {
    if (userId) {
      clients.delete(userId);
      broadcastPresence(userId, 'user.offline');
    }
  });
});

function broadcastPresence(userId, event) {
  const payload = JSON.stringify({ event, user_id: userId });
  clients.forEach((socket) => {
    if (socket.readyState === 1) socket.send(payload);
  });
}

// Start
const start = async () => {
  try {
    await fastify.listen({ port: 8000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
