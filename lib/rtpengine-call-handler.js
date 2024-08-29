const parseSiprecPayload = require('./payload-parser');
const constructSiprecPayload = require('./payload-combiner');
const {getAvailableRtpengine} = require('./utils');
const { v4 } = require('uuid');
const debug = require('debug')('drachtio:siprec-recording-server');
const xml2js = require('xml2js');
const WebSocket = require('ws');

function setupMRFConnection(dlg, rtpEngine, opts) {
  const aiServiceUrl = 'ws://c8f1-49-255-218-102.ngrok-free.app';
  const ws = new WebSocket(aiServiceUrl);

  ws.on('open', () => {
    opts.logger.info('Connected to MRF service');

    // Send initial configuration or call details if needed
    // ws.send(JSON.stringify({
    //   action: 'configure',
    //   callId: opts.callDetails['call-id']
    // }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'start_recording') {
        opts.logger.info('Start recording');

        opts.callDetails['record call'] = 'yes';

        rtpEngine['start recording'](rtpEngine.remote, opts.callDetails)
          .then((response) => {
            if (response.result !== 'ok') {
              throw new Error('error start recording');
            }

            opts.logger.info('Successfully started recording');
            return response;
          }).catch((err) => {
            opts.logger.error(`Failed to start recording: ${err}`);
          });
      }

      if (message.type === 'stop_recording') {
        opts.logger.info('Stop recording');

        opts.callDetails['record call'] = 'no';

        rtpEngine['stop recording'](rtpEngine.remote, opts.callDetails)
          .then((response) => {
            if (response.result !== 'ok') {
              throw new Error('error stop recording');
            }

            opts.logger.info('Successfully stopped recording');
            return response;
          }).catch((err) => {
            opts.logger.error(`Failed to stop recording: ${err}`);
          });
      }
    } catch (error) {
      opts.logger.error(`Error processing message from MRF service: ${error}`);
    }
  });

  ws.on('error', (error) => {
    opts.logger.error(`MRF WebSocket error: ${error}`);
  });

  ws.on('close', () => {
    opts.logger.info('Disconnected from MRFservice');
  });
}

module.exports = (req, res) => {
  const callid = req.get('Call-ID');
  const from = req.getParsedHeader('From');
  const totag = v4();
  const logger = req.srf.locals.logger.child({callid});
  var opts = {
    req,
    res,
    logger,
    callDetails: {
      'call-id': callid,
      'from-tag': from.params.tag
    }
  };

  logger.info(`received SIPREC invite: ${req.uri}`);
  logger.info(`req body: ${req.body}`);

  extractSipSessionID(req.body)
    .then((sipSessionID) => {
      logger.info(`Extracted sipSessionID: ${sipSessionID}`);
      opts.callDetails['call-id'] = sipSessionID;
      return opts;
    })
    .catch((err) => {
      logger.error(`Error extracting sipSessionID: ${err}`);
    });

  const rtpEngine = getAvailableRtpengine();
  parseSiprecPayload(opts)
    .then(allocateEndpoint.bind(null, 'caller', rtpEngine, totag))
    .then(allocateEndpoint.bind(null, 'callee', rtpEngine, totag))
    .then(respondToInvite)
    .then((dlg) => {
      logger.info(`call connected successfully, using rtpengine at ${JSON.stringify(rtpEngine.remote)}`);

      setupMRFConnection(dlg, rtpEngine, opts);

      dlg.on('modify', _onReinvite.bind(null, rtpEngine, logger, totag));
      return dlg.on('destroy', onCallEnd.bind(null, rtpEngine, opts));
    })
    .catch((err) => {
      logger.error(`Error connecting call: ${err}`);
    });
};

function extractSipSessionID(body) {
  const xmlStart = body.indexOf('<?xml');
  const xmlEnd = body.lastIndexOf('</recording>') + '</recording>'.length;
  const xmlContent = body.slice(xmlStart, xmlEnd);

  return new Promise((resolve, reject) => {
    xml2js.parseString(xmlContent, (err, result) => {
      if (err) {
        reject(err);
      } else {
        const sipSessionID = result.recording.session[0].sipSessionID[0];
        resolve(sipSessionID);
      }
    });
  });
}

function _onReinvite(rtpEngine, logger, totag, req, res) {
  const callid = req.get('Call-ID');
  const from = req.getParsedHeader('From');
  const opts = {
    req,
    res,
    logger,
    callDetails: {
      'call-id': callid,
      'from-tag': from.params.tag,
    }
  };

  parseSiprecPayload(opts)
    .then(allocateEndpoint.bind(null, 'caller', rtpEngine, totag))
    .then(allocateEndpoint.bind(null, 'callee', rtpEngine, totag))
    .then((opts) => {
      const body = constructSiprecPayload(opts.rtpengineCallerSdp, opts.rtpengineCalleeSdp, opts.sdp1, opts.sdp2);
      return opts.res.send(200, {body});
    })
    .catch((err) => {
      logger.error(`Error connecting call: ${err}`);
    });

  logger.info(`received SIPREC Re-invite: ${req.uri}`);
}

function allocateEndpoint(which, rtpEngine, totag, opts) {
  // If audio is inactive, rtpengine will stop recording and there is no blank audio in record file.
  const sdp = (which === 'caller' ? opts.sdp1 : opts.sdp2).replace(/a=inactive\r\n/g, 'a=sendonly\r\n');
  const args = Object.assign({}, opts.callDetails, {
    sdp,
    'replace': ['origin', 'session-connection'],
    'transport protocol': 'RTP/AVP',
    'record call': 'no',
    'DTLS': 'off',
    'ICE': 'remove',
    'SDES': 'off',
    'flags': ['media handover', 'port latching'],
    'rtcp-mux': ['accept'],
    'direction':  ['public', 'public'],
  });
  if (which === 'callee') Object.assign(args, {'to-tag': totag});

  debug(`callDetails: ${JSON.stringify(opts.callDetails)}`);
  debug(`rtpengine args for ${which}: ${JSON.stringify(args)}, sending to ${JSON.stringify(rtpEngine.remote)}`);
  return rtpEngine[which === 'caller' ? 'offer' : 'answer'](rtpEngine.remote, args)
    .then((response) => {
      if (response.result !== 'ok') {
        throw new Error('error connecting to rtpengine');
      }
      opts[which === 'caller' ? 'rtpengineCallerSdp' : 'rtpengineCalleeSdp'] = response.sdp;
      return opts;
    });
}

function respondToInvite(opts) {
  const srf = opts.req.srf;
  const payload = constructSiprecPayload(opts.rtpengineCallerSdp, opts.rtpengineCalleeSdp, opts.sdp1, opts.sdp2);
  return srf.createUAS(opts.req, opts.res, {localSdp: payload});
}

function onCallEnd(rtpEngine, opts) {
  opts.logger.info('call ended');
  return rtpEngine.delete(rtpEngine.remote, opts.callDetails)
    .then((response) => {
      return debug(`response to rtpengine delete: ${JSON.stringify(response)}`);
    });
}
