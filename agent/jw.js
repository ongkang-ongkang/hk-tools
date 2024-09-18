const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { DateTime } = require('luxon');
const TelegramBot = require('node-telegram-bot-api');

// Ganti dengan token API bot Telegram Anda
const TELEGRAM_TOKEN = '123456789:tailah-jijikbanget';
// Ganti dengan chat_id penerima log
const TELEGRAM_CHAT_ID = '99887766';

// Inisialisasi bot Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN);

class AgentAPI {
    constructor() {
        this.baseURL = 'https://api.agent301.org';
        this.proxies = this.loadProxies();
    }

    loadProxies() {
        try {
            return fs.readFileSync('./../data/proxy.txt', 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);
        } catch (error) {
            this.log(`Kesalahan saat membaca file proxy: ${error.message}`, 'error');
            return [];
        }
    }

    headers(authorization) {
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'id-ID,id;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Authorization': authorization,
            'Content-Type': 'application/json',
            'Origin': 'https://telegram.agent301.org',
            'Referer': 'https://telegram.agent301.org/',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        };
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logTypes = {
            success: msg => console.log(`[${timestamp}] [*] ${msg}`.green),
            custom: msg => console.log(`[${timestamp}] [*] ${msg}`),
            error: msg => {
                console.log(`[${timestamp}] [!] ${msg}`.red);
                this.sendTelegramLog(`[${timestamp}] [!] ${msg}`);
            },
            warning: msg => {
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                this.sendTelegramLog(`[${timestamp}] [*] ${msg}`);
            },
            info: msg => {
                console.log(`[${timestamp}] [*] ${msg}`.blue);
                this.sendTelegramLog(`[${timestamp}] [*] ${msg}`);
            }
        };
        (logTypes[type] || logTypes.info)(msg);
    }

    async sendTelegramLog(message) {
        try {
            await bot.sendMessage(TELEGRAM_CHAT_ID, message);
        } catch (error) {
            console.error(`Gagal mengirim log ke Telegram: ${error.message}`);
        }
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${new Date().toLocaleTimeString()}] [*] Menunggu ${i} detik untuk melanjutkan...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    extractFirstName(authorization) {
        try {
            const params = new URLSearchParams(authorization);
            const userString = params.get('user');
            if (userString) {
                const userObject = JSON.parse(decodeURIComponent(userString));
                return userObject.first_name;
            }
        } catch (error) {
            this.log(`Tidak bisa membaca data: ${error.message}`, 'error');
        }
        return 'Unknown';
    }

    async makeRequest(method, url, payload, authorization, proxy, retries = 3) {
        const proxyAgent = new HttpsProxyAgent(proxy);
        const config = {
            method,
            url,
            data: payload,
            headers: this.headers(authorization),
            httpsAgent: proxyAgent
        };

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios(config);
                return response.data;
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                this.log(`Kesalahan request (coba ${attempt}/${retries}): ${error.message}. Mencoba lagi...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async checkProxyIP(proxy) {
        try {
            const response = await this.makeRequest('GET', 'https://api.ipify.org?format=json', {}, '', proxy);
            return response.ip;
        } catch (error) {
            throw new Error(`Kesalahan saat memeriksa IP proxy: ${error.message}`);
        }
    }

    async getMe(authorization, proxy) {
        try {
            return await this.makeRequest('POST', `${this.baseURL}/getMe`, {"referrer_id": 376905749}, authorization, proxy);
        } catch (error) {
            this.log(`Kesalahan mengambil informasi pengguna: ${error.message}`, 'error');
            throw error;
        }
    }

    async completeTask(authorization, taskType, taskTitle, currentCount = 0, maxCount = 1, proxy) {
        try {
            const response = await this.makeRequest('POST', `${this.baseURL}/completeTask`, { "type": taskType }, authorization, proxy);
            const result = response.result;
            this.log(`Menyelesaikan tugas ${taskTitle.yellow} ${currentCount + 1}/${maxCount} berhasil | Hadiah ${result.reward.toString().magenta} | Saldo ${result.balance.toString().magenta}`, 'custom');
            return result;
        } catch (error) {
            this.log(`Menyelesaikan tugas ${taskTitle} gagal: ${error.message}`, 'error');
        }
    }

    async getTasks(authorization, proxy) {
        try {
            const response = await this.makeRequest('POST', `${this.baseURL}/getTasks`, {}, authorization, proxy);
            return response.result.data;
        } catch (error) {
            this.log(`Kesalahan mengambil daftar tugas: ${error.message}`, 'error');
            throw error;
        }
    }

    async processTasks(authorization, proxy) {
        try {
            const tasks = await this.getTasks(authorization, proxy);
            const unclaimedTasks = tasks.filter(task => !task.is_claimed && !['nomis2', 'boost', 'invite_3_friends'].includes(task.type));

            if (unclaimedTasks.length === 0) {
                this.log("Tidak ada tugas yang belum diselesaikan.", 'warning');
                return;
            }

            for (const task of unclaimedTasks) {
                const remainingCount = task.max_count ? task.max_count - (task.count || 0) : 1;
                for (let i = 0; i < remainingCount; i++) {
                    await this.completeTask(authorization, task.type, task.title, i, remainingCount, proxy);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.log(`Kesalahan memproses tugas: ${error.message}`, 'error');
        }
    }

    async spinWheel(authorization, proxy) {
        try {
            const response = await this.makeRequest('POST', `${this.baseURL}/wheel/spin`, {}, authorization, proxy);
            const result = response.result;
            this.log(`Spin berhasil: mendapatkan ${result.reward}`, 'success');
            this.log(`* Saldo : ${result.balance}`);
            this.log(`* Toncoin : ${result.toncoin}`);
            this.log(`* Notcoin : ${result.notcoin}`);
            this.log(`* Tiket : ${result.tickets}`);
            return result;
        } catch (error) {
            this.log(`Kesalahan saat spin: ${error.message}`, 'error');
            throw error;
        }
    }

    async spinAllTickets(authorization, initialTickets, proxy) {
        let tickets = initialTickets;
        while (tickets > 0) {
            try {
                const result = await this.spinWheel(authorization, proxy);
                tickets = result.tickets;
            } catch (error) {
                this.log(`Kesalahan saat spin: ${error.message}`, 'error');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('Tiket telah habis.', 'warning');
    }

    async wheelLoad(authorization, proxy) {
        try {
            const response = await this.makeRequest('POST', `${this.baseURL}/wheel/load`, {}, authorization, proxy);
            return response.result;
        } catch (error) {
            this.log(`Kesalahan saat memuat wheel: ${error.message}`, 'error');
            throw error;
        }
    }

    async wheelTask(authorization, type, proxy) {
        try {
            const response = await this.makeRequest('POST', `${this.baseURL}/wheel/task`, { type }, authorization, proxy);
            return response.result;
        } catch (error) {
            this.log(`Kesalahan saat melaksanakan tugas ${type}: ${error.message}`, 'error');
            throw error;
        }
    }

    async handleWheelTasks(authorization, proxy) {
        try {
            let wheelData = await this.wheelLoad(authorization, proxy);
            const currentTimestamp = Math.floor(Date.now() / 1000);

            if (currentTimestamp > wheelData.tasks.daily) {
                const dailyResult = await this.wheelTask(authorization, 'daily', proxy);
                const nextDaily = DateTime.fromSeconds(dailyResult.tasks.daily).toRelative();
                this.log(`Klaim tiket harian berhasil. Klaim berikutnya: ${nextDaily}`, 'success');
                wheelData = dailyResult;
            } else {
                const nextDaily = DateTime.fromSeconds(wheelData.tasks.daily).toRelative();
                this.log(`Waktu klaim tiket harian berikutnya: ${nextDaily}`, 'info');
            }

            if (!wheelData.tasks.bird) {
                const birdResult = await this.wheelTask(authorization, 'bird', proxy);
                this.log('Menyelesaikan tugas tiket bird berhasil', 'success');
                wheelData = birdResult;
            }

            let hourCount = wheelData.tasks.hour.count;
            while (hourCount < 5 && currentTimestamp > wheelData.tasks.hour.timestamp) {
                const hourResult = await this.wheelTask(authorization, 'hour', proxy);
                hourCount = hourResult.tasks.hour.count;
                this.log(`Menyelesaikan tugas hour berhasil. Ke-${hourCount}/5`, 'success');
                wheelData = hourResult;
            }

            if (hourCount === 0 && currentTimestamp < wheelData.tasks.hour.timestamp) {
                const nextHour = DateTime.fromSeconds(wheelData.tasks.hour.timestamp).toRelative();
                this.log(`Waktu untuk menonton video klaim tiket berikutnya: ${nextHour}`, 'info');
            }

            return wheelData;
        } catch (error) {
            this.log(`Kesalahan saat menangani tugas wheel: ${error.message}`, 'error');
        }
    }

    formatProxy(proxy) {
        // dari ip:port:user:pass ke http://user:pass@ip:port
        // jika format http, biarkan saja
        if (proxy.startsWith('http')) {
            return proxy;
        }
        const parts = proxy.split(':');
        if (parts.length === 4) {
            return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
        } else {
            return `http://${parts[0]}:${parts[1]}`;
        }
    }

    async main() {
        const dataFile = './../data/agent.txt';
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let no = 0; no < data.length; no++) {
                const authorization = data[no];
                const proxyIndex = no % this.proxies.length;
                const proxy = this.formatProxy(this.proxies[proxyIndex]);
                const firstName = this.extractFirstName(authorization);

                try {
                    let proxyIP = 'Unknown';
                    try {
                        proxyIP = await this.checkProxyIP(proxy);
                    } catch (error) {
                        this.log(`Tidak bisa memeriksa IP proxy: ${error.message}`, 'warning');
                        continue;
                    }

                    console.log(`========== Akun ${no + 1}/${data.length} | ${firstName} | ip: ${proxyIP} ==========`.green);
                    const userInfo = await this.getMe(authorization, proxy);
                    this.log(`Saldo: ${userInfo.result.balance.toString().white}`, 'success');
                    this.log(`Tiket: ${userInfo.result.tickets.toString().white}`, 'success');

                    await this.processTasks(authorization, proxy);
                    await this.handleWheelTasks(authorization, proxy);

                    if (userInfo.result.tickets > 0) {
                        this.log('Mulai spin wheel...', 'info');
                        await this.spinAllTickets(authorization, userInfo.result.tickets, proxy);
                    }
                } catch (error) {
                    this.log(`Kesalahan memproses akun ${no + 1}: ${error.message}`, 'error');
                }
            }

            await this.waitWithCountdown(60 * 60);
        }
    }
}

if (require.main === module) {
    const agentAPI = new AgentAPI();
    agentAPI.main().catch(err => {
        agentAPI.log(err.message, 'error');
        process.exit(1);
    });
}
