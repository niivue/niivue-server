const express = require("express");
const ws = require("ws");
const queryString = require("query-string");
const { v4: uuidv4 } = require("uuid");
const ADD_VOLUME_URL = "add volume url";
const UPDATE = "update";
const CREATE = "create";
const JOIN = "join";
const REMOVE_VOLUME_URL = "remove volume media";
const ADD_MESH_URL = "add mesh url";
const REMOVE_MESH_URL = "remove mesh media";
const SET_4D_VOL_INDEX = "set 4d vol index";
const UPDATE_IMAGE_OPTIONS = "update image options";
const ACK = "ack";
const UPDATE_CROSSHAIR_POS = "update crosshair pos";
const CROSSHAIR_POS_UPDATED = "crosshair pos updated";
const USER_JOINED = "user joined";
const UPDATE_USER_STATE = "update user state";
const USER_STATE_UPDATED = "user state updated";
const SCENE_STATE_UPDATED = "scene state update";

let sessionOwnersMap = new Map();
let sessionMap = new Map();
let userMap = new Map();
let connectionUserMap = new Map();
const app = express();
const wsServer = new ws.Server({ noServer: true });
const connections = [];

function sendOtherClientsMessage(sender, msg) {
  let others = connections.filter((c) => c != sender);
  sendClientsMessage(others, msg);
}

function sendClientsMessage(clientConnections, msg) {
  for (const connection of clientConnections) {
    connection.send(JSON.stringify(msg));
  }
}

/**
 * Get a random color to assign user
 * @returns {number[]} RGB color
 */
function getRandomColor() {
  let color;
  switch (Array.from(userMap.values()).length) {
    case 0:
      color = [1, 0, 0];
    case 1:
      color = [0, 1, 0];
      break;
    case 2:
      color = [0, 0, 1];
      break;
    default:
      color = [Math.random(), Math.random(), Math.random()];
  }

  return [...color, 1];
}

function assignUser(parsedMessage) {
  let displayName;
  let id = uuidv4();
  if (parsedMessage.displayName) {
    displayName = parsedMessage.displayName;
  } else {
    displayName = `user-${id}`;
  }
  let userKey = uuidv4();
  let color = parsedMessage.color ? parsedMessage.color : getRandomColor();
  let crosshairPos = [0.5, 0.5, 0.5];
  userMap.set(userKey, { id, displayName, color, crosshairPos });
  return userKey;
}

function getSessionUrl(connectionRequest, session) {
  let host = "";
  let protocol = "ws://";
  for (let i = 0; i < connectionRequest.rawHeaders.length; i++) {
    if (connectionRequest.rawHeaders[i] === "Host") {
      host = connectionRequest.rawHeaders[i + 1];
    } else if (connectionRequest.rawHeaders[i] === "Host") {
    }
  }
  let sessionUrl = new URL(protocol + host);
  sessionUrl.pathname = "websockets";
  sessionUrl.search = "session=" + session;
  return sessionUrl.href;
}

wsServer.on("connection", (websocketConnection, connectionRequest) => {
  const [_path, params] = connectionRequest?.url?.split("?");
  const connectionParams = queryString.parse(params);
  const session = connectionParams["session"];
  // console.log('new connection on session ' + session);
  if (connections.findIndex((w) => w === websocketConnection) === -1) {
    connections.push(websocketConnection);
    console.log("added connection");
    console.log(connections.length + " connections");
  }

  let scene = null;
  if (session) {
    if (sessionMap.has(session)) {
      scene = sessionMap.get(session);
    }
  }

  websocketConnection.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    let res = {
      message: "OK",
      op: ACK,
    };

    switch (parsedMessage.op) {
      case CREATE:
        res.op = CREATE;
        // check if we already have the session
        if (sessionMap.has(session)) {
          res.message = "duplicate session";
          res.isError = true;
        } else {
          scene = {
            elevation: 0,
            azimuth: 0,
            zoom: 1.0,
            cliplane: [0, 0, 0, 0],
            key: uuidv4(),
          };
          sessionMap.set(session, scene);
          console.log("scene created for " + session);
          let userKey = assignUser(parsedMessage);
          let user = userMap.get(userKey);
          res["url"] = getSessionUrl(connectionRequest, session);
          res["key"] = scene.key;
          res["userId"] = user.id;
          res["userKey"] = userKey;
          res["userName"] = user.displayName;

          // add this as a session owner
          sessionOwnersMap.set(session, [user.id]);

          if (!connectionUserMap.has(websocketConnection)) {
            connectionUserMap.set(websocketConnection, user.name);
          } else {
            console.log(
              "connection already associatged with " +
                connectionUserMap.get(websocketConnection)
            );
          }
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
          sendOtherClientsMessage(websocketConnection, {
            op: UPDATE,
            message: "OK",
            azimuth: scene.azimuth,
            elevation: scene.elevation,
            zoom: scene.zoom,
            clipPlane: scene.clipPlane,
          });
        }
        break;
      case JOIN:
        if (scene) {
          res.op = JOIN;
          res["isController"] = parsedMessage.key === scene.key;          
          res["url"] = getSessionUrl(connectionRequest, session);
          res["userList"] = Array.from(userMap.values());
          let userKey = assignUser(parsedMessage);
          res["userKey"] = userKey;
          let user = userMap.get(userKey);
          res["userId"] = user.id;
          res["userName"] = user.displayName;

          // add user as controller
          if(res["isController"]) {
            sessionOwnersMap.get(session).push(user.id);
          }

          if (!connectionUserMap.has(websocketConnection)) {
            connectionUserMap.set(websocketConnection, user.id);
          } else {
            console.log(
              "connection already associated with " +
                connectionUserMap.get(websocketConnection)
            );
          }
          sendOtherClientsMessage(websocketConnection, {
            op: USER_JOINED,
            user: userMap.get(res["userKey"]),
          });
        } else {
          console.log("scene for " + session + " not found");
        }
        break;
      case UPDATE_IMAGE_OPTIONS:
      case ADD_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          let msg = {
            op: parsedMessage.op,
            urlImageOptions: parsedMessage.urlImageOptions,
          };
          sendOtherClientsMessage(websocketConnection, msg);
        }
        break;
      case REMOVE_VOLUME_URL:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: REMOVE_VOLUME_URL,
            url: parsedMessage.url,
          });
        }
        break;
      case SET_4D_VOL_INDEX:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: SET_4D_VOL_INDEX,
            url: parsedMessage.url,
            index: parsedMessage.index,
          });
        }
        break;
      case ADD_MESH_URL:
        if (scene.key === parsedMessage.key) {
          let msg = {
            op: parsedMessage.op,
            urlMeshOptions: parsedMessage.urlMeshOptions,
          };
          sendOtherClientsMessage(websocketConnection, msg);
        }
        break;
      case REMOVE_MESH_URL:
        if (scene.key === parsedMessage.key) {
          sendOtherClientsMessage(websocketConnection, {
            op: REMOVE_MESH_URL,
            url: parsedMessage.url,
          });
        }
        break;
      case UPDATE_USER_STATE:
        if (userMap.has(parsedMessage.userKey)) {
          let user = userMap.get(parsedMessage.userKey);
          if (parsedMessage.id == user.id) {
            user.color = parsedMessage.color;
            user.displayName = parsedMessage.displayName;

            userMap.set(parsedMessage.userKey, user);
          }
        }
        break;

      case UPDATE_CROSSHAIR_POS:
        if (userMap.has(parsedMessage.userKey)) {
          let user = userMap.get(parsedMessage.userKey);
          if (parsedMessage.id == user.id) {
            console.log("updating crosshairs for " + user.displayName);
            console.log(parsedMessage.crosshairPos);

            user.crosshairPos = parsedMessage.crosshairPos;
            userMap.set(parsedMessage.userKey, user);
            let msg = {
              op: CROSSHAIR_POS_UPDATED,
              id: user.id,
              isController: sessionOwnersMap.get(session).includes(user.id),
              crosshairPos: parsedMessage.crosshairPos,
            };

            sendOtherClientsMessage(websocketConnection, msg);
          }
        }
        break;

      default:
        res["op"] = SCENE_STATE_UPDATED;
        res["azimuth"] = scene.azimuth;
        res["elevation"] = scene.elevation;
        res["zoom"] = scene.zoom;
        res["clipPlane"] = scene.clipPlane;

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
server.on("upgrade", (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (socket) => {
    wsServer.emit("connection", socket, request);
  });
});
