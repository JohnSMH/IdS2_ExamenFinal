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

const SECRET_ENDPOINT = 'http://localhost:3000/getsecret';

app.post('/candidatos', async (req, res) => {
  const candidato = req.body.candidato;
  const secret = req.body.secret;

  // Validar el secret
  try {
    const response = await axios.get(SECRET_ENDPOINT);
    const secretFromEndpoint = response.data.mysecret;
    if (secret !== secretFromEndpoint) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }

  // Validar el estado
  try {
    const response = await axios.get('http://localhost:3001/estado');
    const estado = response.data.estado;
    if (estado !== 1) {
      return res.status(400).json({ error: 'El sistema no está aceptando más candidatos en este momento.' });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }

  // Obtener el arreglo actual de candidatos
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/candidatos`);
    const candidatos = response.data || [];

    // Agregar el nuevo candidato al arreglo
    candidatos.push(candidato);

    // Actualizar el arreglo en el state store
    await axios.post(`${stateStoreBaseUrl}`, [{
      key: 'candidatos',
      value: candidatos
    }]);

    console.log('Candidato saved:', candidato);
    res.sendStatus(201);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/candidatos', async (req, res) => {
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/candidatos`);
    const candidatos = response.data || [];
    console.log('Candidatos retrieved:', candidatos);
    res.status(200).json({ candidatos });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.listen(3002, () => {
  console.log('Server running on port 3002');
});

app.post('/cerrarfase', async (req, res) => {
  const secret = req.body.secret;
  
  // validate secret
  try {
    const secretResponse = await axios.get('http://localhost:3000/getsecret');
    if (secretResponse.data.mysecret !== secret) {
      res.sendStatus(401);
      return;
    }
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
    return;
  }
  
  // update state to 2
  const state = [
    {
      key: 'estado',
      value: 2
    }
  ];
  
  try {
    await axios.post(`http://localhost:3001/estado`,{estado:2})
    await axios.post(`${stateStoreBaseUrl}`, state);
    console.log('Fase cerrada');
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});