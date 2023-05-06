import express from 'express'
import axios from 'axios'

const app = express();
app.use(express.json());

const protocol = process.env.DAPR_PROTOCOL ?? "http";
const DAPR_HOST = process.env.DAPR_HOST ?? "localhost";

let port;
switch (protocol) {
  case "http": {
    port = process.env.DAPR_HTTP_PORT;
    break;
  }
  case "grpc": {
    port = process.env.DAPR_GRPC_PORT;
    break;
  }
  default: {
    port = 3500;
  }
}

const DAPR_STATE_STORE_NAME = 'statestore';
const stateStoreBaseUrl = `${protocol}://${DAPR_HOST}:${port}/v1.0/state/${DAPR_STATE_STORE_NAME}`;

app.post('/estado', async (req, res) => {
  const estado = req.body.estado;
  const state = [
    {
      key: 'estado',
      value: estado
    }
  ];
  
  try {
    await axios.post(`${stateStoreBaseUrl}`, state);
    console.log('Estado saved:', estado);
    res.sendStatus(201);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/estado', async (req, res) => {
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/estado`);
    console.log(response.data)
    const estado = response.data;
    console.log('Estado retrieved:', estado);
    res.status(201).json({ estado: estado })
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});