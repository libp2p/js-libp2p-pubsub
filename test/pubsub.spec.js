/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
chai.use(require('chai-spies'))
const expect = chai.expect
const sinon = require('sinon')

const PubsubBaseProtocol = require('../src')
const { randomSeqno } = require('../src/utils')
const {
  createPeerInfo,
  createMockRegistrar,
  mockRegistrar,
  PubsubImplementation,
  ConnectionPair
} = require('./utils')

describe('pubsub base protocol', () => {
  describe('should start and stop properly', () => {
    let pubsub
    let sinonMockRegistrar

    beforeEach(async () => {
      const peerInfo = await createPeerInfo()
      sinonMockRegistrar = {
        handle: sinon.stub(),
        register: sinon.stub(),
        unregister: sinon.stub()
      }

      pubsub = new PubsubBaseProtocol({
        debugName: 'pubsub',
        multicodecs: '/pubsub/1.0.0',
        peerInfo: peerInfo,
        registrar: sinonMockRegistrar
      })

      expect(pubsub.peers.size).to.be.eql(0)
    })

    afterEach(() => {
      sinon.restore()
    })

    it('should be able to start and stop', async () => {
      await pubsub.start()
      expect(sinonMockRegistrar.handle.calledOnce).to.be.true()
      expect(sinonMockRegistrar.register.calledOnce).to.be.true()

      await pubsub.stop()
      expect(sinonMockRegistrar.unregister.calledOnce).to.be.true()
    })

    it('should not throw to start if already started', async () => {
      await pubsub.start()
      await pubsub.start()
      expect(sinonMockRegistrar.handle.calledOnce).to.be.true()
      expect(sinonMockRegistrar.register.calledOnce).to.be.true()

      await pubsub.stop()
      expect(sinonMockRegistrar.unregister.calledOnce).to.be.true()
    })

    it('should not throw if stop before start', async () => {
      await pubsub.stop()
      expect(sinonMockRegistrar.register.calledOnce).to.be.false()
      expect(sinonMockRegistrar.unregister.calledOnce).to.be.false()
    })
  })

  describe('should handle messages creating and signing', () => {
    let peerInfo
    let pubsub

    before(async () => {
      peerInfo = await createPeerInfo()
      pubsub = new PubsubBaseProtocol({
        debugName: 'pubsub',
        multicodecs: '/pubsub/1.0.0',
        peerInfo: peerInfo,
        registrar: mockRegistrar
      })
    })

    afterEach(() => {
      sinon.restore()
    })

    it('_buildMessage normalizes and signs messages', async () => {
      const message = {
        from: peerInfo.id.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      const signedMessage = await pubsub._buildMessage(message)
      const verified = await pubsub.validate(signedMessage)

      expect(verified).to.eql(true)
    })

    it('validate with strict signing off will validate a present signature', async () => {
      const message = {
        from: peerInfo.id.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      sinon.stub(pubsub, 'strictSigning').value(false)

      const signedMessage = await pubsub._buildMessage(message)
      const verified = await pubsub.validate(signedMessage)

      expect(verified).to.eql(true)
    })

    it('validate with strict signing requires a signature', async () => {
      const message = {
        from: peerInfo.id.id,
        data: 'hello',
        seqno: randomSeqno(),
        topicIDs: ['test-topic']
      }

      const verified = await pubsub.validate(message)

      expect(verified).to.eql(false)
    })
  })

  describe('should be able to register two nodes', () => {
    const protocol = '/pubsub/1.0.0'
    let pubsubA, pubsubB
    let peerInfoA, peerInfoB
    const registrarRecordA = {}
    const registrarRecordB = {}

    // mount pubsub
    beforeEach(async () => {
      peerInfoA = await createPeerInfo()
      peerInfoB = await createPeerInfo()

      pubsubA = new PubsubImplementation(protocol, peerInfoA, createMockRegistrar(registrarRecordA))
      pubsubB = new PubsubImplementation(protocol, peerInfoB, createMockRegistrar(registrarRecordB))
    })

    // start pubsub
    beforeEach(async () => {
      await Promise.all([
        pubsubA.start(),
        pubsubB.start()
      ])

      expect(Object.keys(registrarRecordA)).to.have.lengthOf(1)
      expect(Object.keys(registrarRecordB)).to.have.lengthOf(1)
    })

    afterEach(() => {
      sinon.restore()

      return Promise.all([
        pubsubA.stop(),
        pubsubB.stop()
      ])
    })

    it('should handle onConnect as expected', async () => {
      const onConnectA = registrarRecordA[protocol].onConnect
      const handlerB = registrarRecordB[protocol].handler

      // Notice peers of connection
      const [c0, c1] = ConnectionPair()

      await onConnectA(peerInfoB, c0)
      await handlerB({
        protocol,
        stream: c1.stream,
        remotePeer: peerInfoA.id
      })

      expect(pubsubA.peers.size).to.be.eql(1)
      expect(pubsubB.peers.size).to.be.eql(1)
    })

    it('should handle onDisconnect as expected', async () => {
      const onConnectA = registrarRecordA[protocol].onConnect
      const onDisconnectA = registrarRecordA[protocol].onDisconnect
      const handlerB = registrarRecordB[protocol].handler
      const onDisconnectB = registrarRecordB[protocol].onDisconnect

      // Notice peers of connection
      const [c0, c1] = ConnectionPair()

      await onConnectA(peerInfoB, c0)
      await handlerB({
        protocol,
        stream: c1.stream,
        remotePeer: peerInfoA.id
      })

      // Notice peers of disconnect
      onDisconnectA(peerInfoB)
      onDisconnectB(peerInfoA)

      expect(pubsubA.peers.size).to.be.eql(0)
      expect(pubsubB.peers.size).to.be.eql(0)
    })
  })
})
