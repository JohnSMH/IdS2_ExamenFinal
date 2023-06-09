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

// Obtener arreglo de candidatos desde el statestore
let candidatos;
(async function getCandidatos() {
  try {
    const response = await axios.get(`http://localhost:3002/candidatos`);
    candidatos = response.data.candidatos;
    console.log('Candidatos:', candidatos);
  } catch (error) {
    console.error(error);
  }
})();

app.post('/votar', async (req, res) => {
  const votante = req.body.votante;
  const candidato = req.body.candidato;

  // Verificar si el votante ya ha votado
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/votos`);
    const votos = response.data || [];
    const votanteRegistrado = votos.some(voto => voto.votante === votante);
    if (votanteRegistrado) {
      await addVotoFallido(stateStoreBaseUrl);
      return res.status(400).json({ message: 'El votante ya ha emitido su voto' });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }

  // Verificar si el candidato existe
  try {
    const response = await axios.get(`http://localhost:3002/candidatos`);
    const candidatos = response.data.candidatos || [];
    const candidatoExistente = candidatos.some(cand => cand.Nombre === candidato);
    if (!candidatoExistente) {
      await addVotoFallido(stateStoreBaseUrl);
      return res.status(400).json({ message: 'El candidato especificado no existe' });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }

  // Verificar si la fase de votación está abierta
  try {
    const response = await axios.get(`http://localhost:3001/estado`);
    const estado = response.data.estado;
    if (estado !== 2) {
      await addVotoFallido(stateStoreBaseUrl);
      return res.status(400).json({ message: 'La fase de votación ha sido cerrada' });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }

  let currentVotos = [];
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/votos`);
    currentVotos = response.data || [];
  } catch (error) {
    console.error(error);
  }

  const newVoto = { votante, candidato };
  currentVotos.push(newVoto);
  
  // Guardar el array actualizado en el estado de votos
  try {
    await axios.post(`${stateStoreBaseUrl}`, [{
      key: 'votos',
      value: currentVotos
    }]);
    await addVotoValido(stateStoreBaseUrl);
    console.log('Voto guardado:', newVoto);
    res.sendStatus(201);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/votos', async (req, res) => {
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/votos`);
    console.log(response.data)
    const votos = response.data;
    console.log('Votos:', votos);
    res.status(200).json(votos);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.post('/cerrarfase', async (req, res) => {
  const { secret } = req.body;
  
  try {
    // Validar secreto
    const response = await axios.get('http://localhost:3000/getsecret');
    const secretFromServer = response.data.mysecret;
    if (secret !== secretFromServer) {
      return res.status(401).send('Unauthorized');
    }
    
    // Validar estado
    const estadoResponse = await axios.get(`http://localhost:3001/estado`);
    const estado = estadoResponse.data.estado;
    if (estado !== 2) {
      return res.status(400).send('Bad Request');
    }

    // Guardar estado
    const state = { estado: 3 };
    await axios.post(`http://localhost:3001/estado`, state);
    console.log('Fase de votación cerrada');
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

async function addVotoValido(stateStoreBaseUrl) {
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/votos_validos`);
    const currentCount = response.data || 0;
    const state = [
      {
        key: 'votos_validos',
        value: currentCount+1
      }
    ];
    await axios.post(`${stateStoreBaseUrl}`, state);
  } catch (error) {
    console.error(error);
  }
}

async function addVotoFallido(stateStoreBaseUrl) {
  try {
    const response = await axios.get(`${stateStoreBaseUrl}/votos_fallidos`);
    const currentCount = response.data || 0;
    const state = [
      {
        key: 'votos_fallidos',
        value: currentCount+1
      }
    ];
    await axios.post(`${stateStoreBaseUrl}`, state);
  } catch (error) {
    console.error(error);
  }
}

app.get('/votosStat', async (req, res) => {
  try {
    const responseExitosos = await axios.get(`${stateStoreBaseUrl}/votos_validos`);
    const currentCountExitosos = responseExitosos.data || 0;
    const responseFallidos = await axios.get(`${stateStoreBaseUrl}/votos_fallidos`);
    const currentCountFallidos = responseFallidos.data || 0;
    res.status(200).json({ currentCountExitosos, currentCountFallidos });
  } catch (error) {
    console.error('Error al obtener el estado de los votos:', error);
    res.sendStatus(500);
  }
});

app.listen(3003, () => {
  console.log('Server running on port 3003');
});