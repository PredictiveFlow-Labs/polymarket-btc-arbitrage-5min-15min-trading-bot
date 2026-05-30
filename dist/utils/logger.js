"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
exports.getLogger = getLogger;
const pino_1 = __importDefault(require("pino"));
let _logger = null;
const isTest = process.env['NODE_ENV'] === 'test';
function createLogger(level = 'info') {
    // In test/silent mode avoid spawning pino-pretty worker threads
    if (isTest || level === 'silent') {
        _logger = (0, pino_1.default)({ level: 'silent' });
        return _logger;
    }
    _logger = (0, pino_1.default)({
        level,
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
                messageFormat: '{msg}',
                singleLine: false,
            },
        },
    });
    return _logger;
}
function getLogger() {
    if (!_logger)
        _logger = createLogger();
    return _logger;
}
//# sourceMappingURL=logger.js.map