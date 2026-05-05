const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('https://whisperbox.koyeb.app/auth/register', {
      username: 'test_node_' + Date.now(),
      display_name: 'Node Test',
      password: 'password123',
      public_key: 'dummy',
      wrapped_private_key: 'dummy',
      pbkdf2_salt: 'dummy'
    });
    console.log('Success:', res.data.user.username);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

test();
