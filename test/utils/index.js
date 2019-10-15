'use strict'

const lp = require('it-length-prefixed')
const pipe = require('it-pipe')

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')

const PubsubBaseProtocol = require('../../src')
const { message } = require('../../src')

exports.createPeerInfo = async () => {
  const peerId = await PeerId.create({ bits: 1024 })

  return PeerInfo.create(peerId)
}

class PubsubImplementation extends PubsubBaseProtocol {
  constructor (protocol, peerInfo, registrar) {
    super({
      debugName: 'libp2p:pubsub',
      multicodecs: protocol,
      peerInfo: peerInfo,
      registrar: registrar
    })
  }

  publish (topics, messages) {
    // ...
  }

  subscribe (topics) {
    // ...
  }

  unsubscribe (topics) {
    // ...
  }

  _processMessages (idB58Str, conn, peer) {
    pipe(
      conn,
      lp.decode(),
      async function collect (source) {
        for await (const val of source) {
          const rpc = message.rpc.RPC.decode(val)

          return rpc
        }
      }
    )
  }
}

exports.PubsubImplementation = PubsubImplementation

exports.mockRegistrar = {
  register: (multicodec, handlers) => {

  },
  unregister: (multicodec) => {

  }
}
