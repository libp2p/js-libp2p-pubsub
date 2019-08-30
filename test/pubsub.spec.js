/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-spies'))
const expect = chai.expect
const sinon = require('sinon')

const PubsubBaseProtocol = require('../src')
const { randomSeqno } = require('../src/utils')
const utils = require('./utils')
const createNode = utils.createNode

class PubsubImplementation extends PubsubBaseProtocol {
  constructor (libp2p) {
    super('libp2p:pubsub', 'libp2p:pubsub-implementation', libp2p)
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

  _processConnection (idB58Str, conn, peer) {
    // ...
  }
}

describe('pubsub base protocol', () => {
  afterEach(() => {
    sinon.restore()
  })

  describe('fresh nodes', () => {
    let nodeA
    let nodeB
    let psA
    let psB

    before(async () => {
      [nodeA, nodeB] = await Promise.all([
        createNode(),
        createNode()
      ])
    })

    before('mount the pubsub protocol', () => {
      psA = new PubsubImplementation(nodeA)
      psB = new PubsubImplementation(nodeB)

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(psA.peers.size).to.be.eql(0)
          expect(psB.peers.size).to.be.eql(0)
          resolve()
        }, 50)
      })
    })

    before('start both Pubsub', () => {
      return Promise.all([
        psA.start(),
        psB.start()
      ])
    })

    after(() => {
      return Promise.all([
        nodeA.stop(),
        nodeB.stop()
      ])
    })

    it('Dial from nodeA to nodeB', async () => {
      await nodeA.dial(nodeB.peerInfo)

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(psA.peers.size).to.equal(1)
          expect(psB.peers.size).to.equal(1)
          resolve()
        }, 1000)
      })
    })

    it('_buildMessage normalizes and signs messages', async () => {
      const message = {
        from: psA.peerId.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      const signedMessage = await psA._buildMessage(message)
      const verified = await psA.validate(signedMessage)

      expect(verified).to.eql(true)
    })

    it('validate with strict signing off will validate a present signature', async () => {
      const message = {
        from: psA.peerId.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      sinon.stub(psA, 'strictSigning').value(false)

      const signedMessage = await psA._buildMessage(message)
      const verified = await psA.validate(signedMessage)

      expect(verified).to.eql(true)
    })

    it('validate with strict signing requires a signature', async () => {
      const message = {
        from: psA.peerId.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      const verified = await psA.validate(message)

      expect(verified).to.eql(false)
    })
  })

  describe('dial the pubsub protocol on mount', () => {
    let nodeA
    let nodeB
    let psA
    let psB

    before(async () => {
      [nodeA, nodeB] = await Promise.all([
        createNode(),
        createNode()
      ])

      await nodeA.dial(nodeB.peerInfo)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    })

    after(() => {
      return Promise.all([
        nodeA.stop(),
        nodeB.stop()
      ])
    })

    it('dial on pubsub on mount', async () => {
      psA = new PubsubImplementation(nodeA)
      psB = new PubsubImplementation(nodeB)

      await Promise.all([
        psA.start(),
        psB.start()
      ])

      expect(psA.peers.size).to.equal(1)
      expect(psB.peers.size).to.equal(1)
    })

    it('stop both pubsubs', () => {
      psA.stop()
      psB.stop()
    })
  })

  describe('prevent concurrent dials', () => {
    let sandbox
    let nodeA
    let nodeB
    let psA
    let psB

    before(async () => {
      // sandbox = chai.spy.sandbox()
      [nodeA, nodeB] = await Promise.all([
        createNode(),
        createNode()
      ])
      // Put node B in node A's peer book
      nodeA.peerBook.put(nodeB.peerInfo)

      psA = new PubsubImplementation(nodeA)
      psB = new PubsubImplementation(nodeB)

      sandbox = chai.spy.sandbox()

      return psB.start()
    })

    after(() => {
      sandbox.restore()

      return Promise.all([
        nodeA.stop(),
        nodeB.stop()
      ])
    })

    it('does not dial twice to same peer', async () => {
      sandbox.on(psA, ['_onDial'])

      // When node A starts, it will dial all peers in its peer book, which
      // is just peer B
      await psA.start()

      // Simulate a connection coming in from peer B at the same time. This
      // causes pubsub to dial peer B
      nodeA.emit('peer:connect', nodeB.peerInfo)

      return new Promise((resolve) => {
        // Check that only one dial was made
        setTimeout(() => {
          expect(psA._onDial).to.have.been.called.once()
          resolve()
        }, 1000)
      })
    })
  })

  describe('allow dials even after error', () => {
    let sandbox
    let nodeA
    let nodeB
    let psA
    let psB

    before(async () => {
      // sandbox = chai.spy.sandbox()
      [nodeA, nodeB] = await Promise.all([
        createNode(),
        createNode()
      ])
      // Put node B in node A's peer book
      nodeA.peerBook.put(nodeB.peerInfo)

      psA = new PubsubImplementation(nodeA)
      psB = new PubsubImplementation(nodeB)

      sandbox = chai.spy.sandbox()

      return psB.start()
    })

    after(() => {
      sandbox.restore()

      return Promise.all([
        nodeA.stop(),
        nodeB.stop()
      ])
    })

    it('can dial again after error', async () => {
      let firstTime = true
      const dialProtocol = psA.libp2p.dialProtocol.bind(psA.libp2p)
      sandbox.on(psA.libp2p, 'dialProtocol', (peerInfo, multicodec, cb) => {
        // Return an error for the first dial
        if (firstTime) {
          firstTime = false
          return cb(new Error('dial error'))
        }

        // Subsequent dials proceed as normal
        dialProtocol(peerInfo, multicodec, cb)
      })

      // When node A starts, it will dial all peers in its peer book, which
      // is just peer B
      await psA.start()

      // Simulate a connection coming in from peer B. This causes pubsub
      // to dial peer B
      nodeA.emit('peer:connect', nodeB.peerInfo)

      return new Promise((resolve) => {
        // Check that both dials were made
        setTimeout(() => {
          expect(psA.libp2p.dialProtocol).to.have.been.called.twice()
          resolve()
        }, 1000)
      })
    })
  })

  describe('prevent processing dial after stop', () => {
    let sandbox
    let nodeA
    let nodeB
    let psA
    let psB

    before(async () => {
      // sandbox = chai.spy.sandbox()
      [nodeA, nodeB] = await Promise.all([
        createNode(),
        createNode()
      ])

      psA = new PubsubImplementation(nodeA)
      psB = new PubsubImplementation(nodeB)

      sandbox = chai.spy.sandbox()

      return Promise.all([
        psA.start(),
        psB.start()
      ])
    })

    after(() => {
      sandbox.restore()

      return Promise.all([
        nodeA.stop(),
        nodeB.stop()
      ])
    })

    it('does not process dial after stop', () => {
      sandbox.on(psA, ['_onDial'])

      // Simulate a connection coming in from peer B at the same time. This
      // causes pubsub to dial peer B
      nodeA.emit('peer:connect', nodeB.peerInfo)

      // Stop pubsub before the dial can complete
      psA.stop()

      return new Promise((resolve) => {
        // Check that the dial was not processed
        setTimeout(() => {
          expect(psA._onDial).to.not.have.been.called()
          resolve()
        }, 1000)
      })
    })
  })
})
