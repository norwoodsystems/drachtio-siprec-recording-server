const assert = require('assert');
const config = require('config');
const pino = require('pino');
const Srf = require('drachtio-srf');
const srf = new Srf() ;
const logger = srf.locals.logger = pino();
let callHandler;

if (config.has('drachtio.host')) {
  logger.info(config.get('drachtio'), 'attempting inbound connection');
  srf.connect(config.get('drachtio'));
  srf
    .on('connect', (err, hp) => { logger.info(`inbound connection to drachtio listening on ${hp}`);})
    .on('error', (err) => { logger.error(err, `Error connecting to drachtio server: ${err}`); });
}
else {
  logger.info(config.get('drachtio'), 'listening for outbound connections');
  srf.listen(config.get('drachtio'));
}

if (config.has('rtpengine')) {
  logger.info(config.get('rtpengine'), 'using rtpengine as the recorder');
  try {
    callHandler = require('./lib/rtpengine-call-handler');
    // start DTMF listener
    require('./lib/dtmf-event-handler')(logger);

    // we only want to deal with siprec invites (having multipart content) in this application
    srf.use('invite', (req, res, next) => {
      const ctype = req.get('Content-Type') || '';
      if (!ctype.includes('multipart/mixed')) {
        logger.info(`rejecting non-SIPREC INVITE with call-id ${req.get('Call-ID')}`);
        return res.send(488);
      }
      next();
    });

    // Add error handling for rtpengine timeout
    srf.on('error', (err) => {
      logger.error({ error: err }, 'An error occurred in SRF');
    });
  } catch (error) {
    logger.error({ error }, `Error initializing rtpengine: ${error.message}`);
    // Implement fallback logic here instead of exiting
    callHandler = (req, res) => {
      logger.warn('Using fallback call handler due to rtpengine initialization error');
      res.send(500);
    };
  }
}
else if (config.has('freeswitch')) {
  logger.info(config.get('freeswitch'), 'using freeswitch as the recorder');
  callHandler = require('./lib/freeswitch-call-handler')(logger);
}
else {
  assert('recorder type not specified in configuration: must be either rtpengine or freeswitch');
}

// Modify the srf.invite call to include error handling
srf.invite((req, res) => {
  try {
    callHandler(req, res);
  } catch (error) {
    logger.error({ error, callId: req.get('Call-ID') }, 'Error in call handler');
    res.send(500);
  }
});

module.exports = srf;
