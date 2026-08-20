const net = require('net');
const tls = require('tls');

function encodeSubject(s) {
    return `=?UTF-8?B?${Buffer.from(String(s), 'utf8').toString('base64')}?=`;
}

function envoyerSmtpBrut(cfg, { to, subject, text, html }) {
    return new Promise((resolve, reject) => {
        let socket = net.connect({ host: cfg.host, port: cfg.port });
        let buf = '';
        let step = 'banner';
        let upgraded = false;

        const send = (line) => socket.write(line + '\r\n');

        const onData = (chunk) => {
            buf += chunk;
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || '';
            for (const line of parts) {
                if (!line || line[3] === '-') continue;
                const code = parseInt(line.slice(0, 3), 10);
                try {
                    if (step === 'banner' && code === 220) {
                        send('EHLO glo.local'); step = 'ehlo1';
                    } else if (step === 'ehlo1' && code === 250) {
                        if (!cfg.secure && !upgraded) {
                            send('STARTTLS'); step = 'starttls';
                        } else if (cfg.user) {
                            send('AUTH LOGIN'); step = 'auth';
                        } else {
                            send(`MAIL FROM:<${cfg.from}>`); step = 'mail';
                        }
                    } else if (step === 'starttls' && code === 220) {
                        upgraded = true;
                        const plain = socket;
                        socket = tls.connect({ socket: plain, host: cfg.host, servername: cfg.host }, () => {
                            buf = ''; step = 'ehlo1';
                            send('EHLO glo.local');
                        });
                        socket.setEncoding('utf8');
                        socket.on('data', onData);
                        socket.on('error', reject);
                    } else if (step === 'auth' && code === 334) {
                        send(Buffer.from(cfg.user).toString('base64')); step = 'authuser';
                    } else if (step === 'authuser' && code === 334) {
                        send(Buffer.from(cfg.pass).toString('base64')); step = 'authpass';
                    } else if (step === 'authpass' && code === 235) {
                        send(`MAIL FROM:<${cfg.from}>`); step = 'mail';
                    } else if (step === 'authpass' && code >= 400) {
                        reject(new Error('SMTP AUTH: ' + line));
                    } else if (step === 'mail' && code === 250) {
                        send(`RCPT TO:<${to}>`); step = 'rcpt';
                    } else if (step === 'rcpt' && (code === 250 || code === 251)) {
                        send('DATA'); step = 'data';
                    } else if (step === 'data' && code === 354) {
                        const body = [
                            `From: ${cfg.from}`,
                            `To: ${to}`,
                            `Subject: ${encodeSubject(subject)}`,
                            'MIME-Version: 1.0',
                            html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
                            '',
                            html || text,
                            '.'
                        ].join('\r\n');
                        send(body); step = 'sent';
                    } else if (step === 'sent' && code === 250) {
                        send('QUIT'); resolve(true);
                    } else if (code >= 400) {
                        reject(new Error('SMTP: ' + line));
                    }
                } catch (e) { reject(e); }
            }
        };

        socket.setEncoding('utf8');
        socket.on('data', onData);
        socket.on('error', reject);
        socket.setTimeout(25000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
    });
}

module.exports = { envoyerSmtpBrut };
