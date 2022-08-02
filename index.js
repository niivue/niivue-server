const express = require('express');
const ws = require('ws');
const queryString = require('query-string');
const { v4: uuidv4 } = require('uuid')
const ADD_VOLUME_URL = "add volume url";
const UPDATE = "update";
const CREATE = "create";
const JOIN = "join";
const REMOVE_VOLUME_URL = "remove volume media";
const ADD_MESH_URL = "add mesh url";
const REMOVE_MESH_URL = "remove mesh media";


let sessionMap = new Map();

const app = express();
const wsServer = new ws.Server({ noServer: true });
const connections = [];

function sendClientsMessage(sender, msg) {
  let count = 0;
  for (const connection of connections) {
    if (connection === sender)
      continue;

    connection.send(JSON.stringify(msg));
    count++;
  }
  // console.log('sent ' + count + ' message');
}

wsServer.on('connection', (websocketConnection, connectionRequest) => {
  const [_path, params] = connectionRequest?.url?.split("?");
  const connectionParams = queryString.parse(params);
  const session = connectionParams['session'];
  // console.log('new connection on session ' + session);
  connections.push(websocketConnection);

  let scene = null;
  if (session) {
    if (sessionMap.has(session)) {
      scene = sessionMap.get(session);
    }

  }

  websocketConnection.on('message', message => {
    const parsedMessage = JSON.parse(message);
    let res = {
      message: 'OK'
    }

    switch (parsedMessage.op) {
      case CREATE:
        res['op'] = 'create';
        // check if we already have the session
        if (sessionMap.has(session)) {
          res = {
            message: 'duplicate session',
            isError: true
          }
        }
        else {
          scene = {
            elevation: 0,
            azimuth: 0,
            zoom: 1.0,
            cliplane: [0, 0, 0, 0],
            key: uuidv4()
          }
          sessionMap.set(session, scene);
          let host = '';
          let protocol = 'ws://';
          for (let i = 0; i < connectionRequest.rawHeaders.length; i++) {
            if (connectionRequest.rawHeaders[i] === 'Host') {
              host = connectionRequest.rawHeaders[i + 1];
            } else if (connectionRequest.rawHeaders[i] === 'Host') {

            }
          }
          let sessionUrl = new URL(protocol + host);
          sessionUrl.pathname = 'websockets';
          sessionUrl.search = 'session=' + session;
          res['url'] = sessionUrl.href;
          res['key'] = scene.key;
          // console.log('created session ' + session);
          // console.log('url: ' + res['url']);
        }
        break;
      case UPDATE:
        // console.log('update message called');
        // only allow requests with session key to update
        if (scene.key === parsedMessage.key) {
          scene.azimuth = parsedMessage.azimuth;
          scene.elevation = parsedMessage.elevation;
          scene.zoom = parsedMessage.zoom;
          scene.clipPlane = parsedMessage.clipPlane;
          // console.log('with correct key');
          sendClientsMessage(websocketConnection, {
            op: 'update',
            message: 'OK',
            azimuth: scene.azimuth,
            elevation: scene.elevation,
            zoom: scene.zoom,
            clipPlane: scene.clipPlane
          });
        }
        break;
      case 'join':
        res['op'] = 'join';
        res['isController'] = parsedMessage.key === scene.key;
        break;
      case ADD_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          sendClientsMessage(websocketConnection, {
            op: ADD_VOLUME_URL,
            urlImageOptions: parsedMessage.urlImageOptions
          });
        }
        break;
      case REMOVE_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          sendClientsMessage(websocketConnection, {
            op: REMOVE_VOLUME_URL,
            url: parsedMessage.url
          });
        }
      default:
        res['op'] = 'update';
        res['azimuth'] = scene.azimuth;
        res['elevation'] = scene.elevation;
        res['zoom'] = scene.zoom;
        res['clipPlane'] = scene.clipPlane;

        break;
    }
    // console.log(parsedMessage);
    // console.log(res);
    websocketConnection.send(JSON.stringify(res));
  });
});

// `server` is a vanilla Node.js HTTP server, so use
// the same ws upgrade process described here:
// https://www.npmjs.com/package/ws#multiple-servers-sharing-a-single-https-server
const server = app.listen(3000);
server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, socket => {
    wsServer.emit('connection', socket, request);
  });
});