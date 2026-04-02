import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export const Reporter = {
    sourceApp: 'ThreadsBlocker',

    getHardwareId: () => {
        let hwid = Storage.get('hege_hwid');
        if (!hwid) {
            hwid = typeof crypto !== 'undefined' && crypto.randomUUID 
                ? crypto.randomUUID() 
                : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            Storage.set('hege_hwid', hwid);
        }
        return hwid;
    },

    sha256: async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    submitReport: async (level, message, errorCode = "", metadata = null) => {
        if (!CONFIG.BUG_REPORT_URL || !CONFIG.BUG_REPORT_SALT) {
            return { code: 500, message: 'Bug Reporter is not properly configured.' };
        }

        const hwid = Reporter.getHardwareId();
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        const rawStr = `${timestamp}${hwid}${CONFIG.BUG_REPORT_SALT}`;
        const signature = await Reporter.sha256(rawStr);
        
        const payload = {
            source_app: Reporter.sourceApp,
            version: CONFIG.VERSION,
            hwid: hwid,
            timestamp: timestamp,
            level: level,
            message: message,
            error_code: errorCode,
            metadata: metadata ? JSON.stringify(metadata) : "",
            signature: signature
        };
        
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.BUG_REPORT_URL,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(payload),
                    onload: (response) => {
                        try {
                            const resJson = JSON.parse(response.responseText);
                            resolve(resJson);
                        } catch (e) {
                            resolve({code: response.status, message: response.responseText});
                        }
                    },
                    onerror: (err) => {
                        reject({code: 500, message: 'Network error or CORS issue.'});
                    }
                });
            } else {
                const formBody = new URLSearchParams();
                formBody.append('payload', JSON.stringify(payload));
                
                fetch(CONFIG.BUG_REPORT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: formBody.toString(),
                    redirect: 'follow'
                }).then(async res => {
                    const text = await res.text();
                    try {
                        resolve(JSON.parse(text));
                    } catch(e) {
                        resolve({code: res.status, message: text});
                    }
                }).catch(err => {
                    reject({code: 500, message: err.toString()});
                });
            }
        });
    }
};
