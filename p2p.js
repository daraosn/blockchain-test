const _ = require('lodash');
const net = require('net');

let nodeId = Date.now();
console.log('P2P Blockchain Example');
console.log('Node ID', nodeId);

const mode = process.env.MODE || 'node';
const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || '3210';

let thisNode = {ip: host, port: port};
thisNode.id = `${thisNode.ip}:${thisNode.port}`;

let sockets = [];
let nodes = [thisNode];
let lastBlock = {};
let blockchain = [];

let trackerPort = process.env.TRACKER_PORT;
let trackerIp = process.env.TRACKER_IP || host;

createNode();

if (trackerIp && trackerPort) {
    connectToNode(trackerIp, trackerPort);
}

function addNode(node) {
    let nodeExists = _.filter(nodes, (n) => node.id === n.id).length > 0;
    if (nodeExists) {
        console.error('already added node', node.id);
        return false;
    } else {
        nodes.push(node);
        console.log('added new node', nodes);
        return true;
    }
}

function createNode() {
    let server = net.createServer((socket) => {
        console.log('new node connected', socket.remoteAddress);

        let buffer = "";
        socket.on('data', (data) => {
            console.log('<< node data received:', data.length);

            buffer = parseBuffer(socket, buffer + data);
        });
    });
    server.listen(port, host);
    return server;
}

function connectToNode(ip, port) {
    console.log('connecting to', ip, port);
    if (_.filter(nodes, (n) => { return n.ip === ip && n.port === port }).length > 0) {
        console.error('already connected to node', ip, port);
        return;
    }

    addNode({ id: `${ip}:${port}`, ip: ip, port: port });

    let client = net.connect(port, ip, (socket) => {
        console.log('connected to node', ip);

        sockets.push(client); // TODO: improve

        sendMessage(client, {cmd: 'hello', node: thisNode });
        sendMessage(client, {cmd: 'getNodes'});

        let buffer = "";
        client.on('data', (data) => {
            // console.log('>> response data received:', data.length);
            buffer = parseBuffer(socket, buffer + data);
        });
    });
    return client;
}

function sendMessage(socket, message, silent) {
    // TODO: add proper byte parser + header structure, this very ugly for test purposes only...!
    message = message || {};
    message.nodeId = nodeId;
    socket.write(JSON.stringify(message));
    socket.write('-#@!SEP!@#-');

    if (silent) console.log('>> sendMessage', message.cmd);
}

function parseBuffer(socket, buffer) {
    let bufferArray = buffer.split('-#@!SEP!@#-');
    while(bufferArray.length > 1) {
        parseMessage(socket, bufferArray.shift());
    }
    return bufferArray.join('-#@!SEP!@#-');
}

function parseMessage(socket, message) {
    // TODO: add proper byte parser + header structure
    message = JSON.parse(message);

    console.log('<< parseMessage', message.cmd);
    switch(message.cmd) {
        case 'hello': // from remote client
            if (addNode(message.node)) sockets.push(socket); // TODO: improve
            sendMessage(socket, {cmd: 'hi'});
            break;
        case 'hi': //from remote server
            // noop
            // sendMessage(socket, {cmd: 'lastBlock', block: lastBlock});
            break;
        case 'newBlock':
            console.log('new block', message.blockNumber);
            break;
        case 'getNodes': // from remote client
            sendMessage(socket, {cmd: 'nodeList', nodes: nodes});
            break;
        case 'nodeList': // from remote server
            _.each(message.nodes, (node) => connectToNode(node.ip, node.port));
            break;
        default:
            console.error('>> unrecognized cmd', message.cmd);
            break;
    }
}

function broadcastMessage(message) {
    _.each(sockets, (socket) => sendMessage(socket, message, true));
}

if (mode === 'miner') {
    var i = 0;
    setInterval(function() {
        broadcastMessage({cmd: 'newBlock', block: {number: i}});
        i++;
    },3000);
}