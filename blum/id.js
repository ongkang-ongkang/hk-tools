const axios = require('axios');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const readline = require('readline');
const { DateTime, Duration } = require('luxon');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { HttpsProxyAgent } = require('https-proxy-agent');

// mencoba memuat file ./../.env dan mendapatkan variabel lingkungan DATA_DIR
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (error) {
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

class GameBot {
  constructor(queryId, accountIndex, proxy) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.token = null;
    this.userInfo = null;
    this.currentGameId = null;
    this.firstAccountEndTime = null;
    this.taskKeywords = null;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : '[Unknown IP]';
    let logMessage = '';

    switch(type) {
      case 'success':
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case 'error':
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case 'warning':
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }

    console.log(logMessage);
    await this.randomDelay();
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        await this.log(`Đang sử dụng proxy IP: ${this.proxyIP}`, 'info');
      } else {
        throw new Error(`Tidak dapat memeriksa IP proxy. Kode status: ${response.status}`);
      }
    } catch (error) {
      await this.log(`Error saat memeriksa IP proxy: ${error.message}`, 'error');
    }
  }

  async headers(token = null) {
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'origin': 'https://telegram.blum.codes',
      'referer': 'https://telegram.blum.codes/',
      'user-agent': this.getRandomUserAgent(),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async makeRequest(method, url, data = null, useToken = false) {
    const config = {
      method: method,
      url: url,
      headers: await this.headers(useToken ? this.token : null),
      httpsAgent: new HttpsProxyAgent(this.proxy)
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getNewToken() {
    const url = 'https://user-domain.blum.codes/api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP';
    const data = JSON.stringify({ query: this.queryId, referralToken: "", });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.randomDelay();
        const response = await this.makeRequest('post', url, data);
        this.token = response.token.refresh;
        return this.token;
      } catch (error) {
        await this.log(`Gagal mendapatkan token, coba lagi ${attempt}: ${error.message}`, 'error');
      }
    }
    await this.log('Gagal mendapatkan token setelah 3 kali coba.', 'error');
    return null;
  }

  async getUserInfo() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://user-domain.blum.codes/api/v1/user/me', null, true);
      this.userInfo = response;
      return this.userInfo;
    } catch (error) {
      await this.log(`Tidak dapat mendapatkan informasi pengguna: ${error.message}`, 'error');
      return null;
    }
  }

  async getBalance() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://game-domain.blum.codes/api/v1/user/balance', null, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat mendapatkan informasi saldo: ${error.message}`, 'error');
      return null;
    }
  }

  async playGame() {
    const data = JSON.stringify({ game: 'example_game' });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/game/play', data, true);
      this.currentGameId = response.gameId;
      return response;
    } catch (error) {
      return null;
    }
  }

  async claimGame(points) {
    if (!this.currentGameId) {
      await this.log('Tidak ada gameId saat ini untuk diklaim.', 'warning');
      return null;
    }

    const data = JSON.stringify({ gameId: this.currentGameId, points: points });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/game/claim', data, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat mengklaim hadiah game: ${error.message}`, 'error');
      return null;
    }
  }

  async claimBalance() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/farming/claim', {}, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat mengklaim saldo: ${error.message}`, 'error');
      return null;
    }
  }

  async startFarming() {
    const data = JSON.stringify({ action: 'start_farming' });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/farming/start', data, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat memulai farming: ${error.message}`, 'error');
      return null;
    }
  }

  async checkBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://user-domain.blum.codes/api/v1/friends/balance', null, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat memeriksa saldo teman: ${error.message}`, 'error');
      return null;
    }
  }

  async claimBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://user-domain.blum.codes/api/v1/friends/claim', {}, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat mengklaim saldo teman!`, 'error');
      return null;
    }
  }

  async checkDailyReward() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/daily-reward?offset=-420', {}, true);
      return response;
    } catch (error) {
      return null;
    }
  }

  async Countdown(seconds) {
    for (let i = Math.floor(seconds); i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${`[Tài khoản ${this.accountIndex + 1}]`.padEnd(15)} [*] Menunggu ${i} detik untuk melanjutkan...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('');
  }

  async getTasks() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://earn-domain.blum.codes/api/v1/tasks', null, true);
      return response;
    } catch (error) {
      await this.log(`Tidak dapat mendapatkan daftar tugas: ${error.message}`, 'error');
      return [];
    }
  }

  async startTask(taskId) {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/start`, {}, true);
      return response;
    } catch (error) {
      return null;
    }
  }

  async claimTask(taskId) {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/claim`, {}, true);
      return response;
    } catch (error) {
      return null;
    }
  }

  async getTaskKeywords() {
    try {
      const response = await axios.get('https://raw.githubusercontent.com/dancayairdrop/blum/main/nv.json');
      const data = response.data;

      if (data && data.tasks && Array.isArray(data.tasks)) {
        this.taskKeywords = data.tasks.reduce((acc, item) => {
          if (item.id && item.keyword) {
            acc[item.id] = item.keyword;
          }
          return acc;
        }, {});
      }
    } catch (error) {
      this.taskKeywords = {};
    }
  }

  async validateTask(taskId, keyword) {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/validate`, { keyword }, true);
      return response;
    } catch (error) {
      return null;
    }
  }

  async joinTribe(tribeId) {
    const tribeInfo = await this.checkTribe();
    if (tribeInfo && tribeInfo.id === tribeId) {
      this.log('Anda sudah berada di dalam tribe ini', 'success');
      return false;
    } else if (!tribeInfo) {
      this.log('Tidak dapat memeriksa tribe, lewati bergabung ke tribe', 'warning');
    } else {
      await this.leaveTribe();
    }

    const url = `https:///tribe-domain.blum.codes/api/v1/tribe/${tribeId}/join`;
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', url, {}, true);
      if (response) {
        await this.log('Anda berhasil bergabung ke tribe', 'success');
        return true;
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.message === 'USER_ALREADY_IN_TRIBE') {
      } else {
        await this.log(`Tidak dapat bergabung ke tribe: ${error.message}`, 'error');
      }
      return false;
    }
  }

  async leaveTribe() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.makeRequest(
            'POST',
            'https://tribe-domain.blum.codes/api/v1/tribe/leave',
            {},
            true
        );
        this.log('Berhasil keluar dari tribe', 'success');
        return;
      } catch (error) {
        this.log(`Tidak dapat keluar dari tribe ${attempt}: ${error.message} `, 'error');
        await this.Countdown(5);
      }
    }
  }

  async checkTribe() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.makeRequest(
            'GET',
            'https://tribe-domain.blum.codes/api/v1/tribe/my',
            null,
            true
        );
        return response.data;
      } catch (error) {
        this.log(`Tidak dapat memeriksa tribe: ${error.message}`, 'error');
        await this.Countdown(30);
      }
    }
    return false;
  }

async runAccount() {
    try {
        await this.checkProxyIP();

        let remainingFarmingTime = null;

        const token = await this.getNewToken();
        if (!token) {
            await this.log('Tidak dapat mengambil token, lewati akun ini', 'error');
            return Duration.fromMillis(0);
        }

        const userInfo = await this.getUserInfo();
        if (userInfo === null) {
            await this.log('Tidak dapat mengambil informasi pengguna, lewati akun ini', 'error');
            return Duration.fromMillis(0);
        }

        await this.log(`Mulai memproses akun ${userInfo.username}`, 'info');

        const balanceInfo = await this.getBalance();
        if (balanceInfo) {
            await this.log(`Saldo: ${balanceInfo.availableBalance} | Game: ${balanceInfo.playPasses}`, 'success');

            const tribeId = 'bcf4d0f2-9ce8-4daf-b06f-34d67152c85d';
            await this.joinTribe(tribeId);

            if (!balanceInfo.farming) {
                const farmingResult = await this.startFarming();
                if (farmingResult) {
                    await this.log('Farming berhasil dimulai!', 'success');
                    remainingFarmingTime = Duration.fromObject({ hours: 8 });
                }
            } else {
                const endTime = DateTime.fromMillis(balanceInfo.farming.endTime);
                const formattedEndTime = endTime.setZone('Asia/Ho_Chi_Minh').toFormat('dd/MM/yyyy HH:mm:ss');
                const currentTime = DateTime.now();
                if (currentTime > endTime) {
                    const claimBalanceResult = await this.claimBalance();
                    if (claimBalanceResult) {
                        await this.log('Claim farm berhasil!', 'success');
                    }

                    const farmingResult = await this.startFarming();
                    if (farmingResult) {
                        await this.log('Farming berhasil dimulai!', 'success');
                        remainingFarmingTime = Duration.fromObject({ hours: 8 });
                    }
                } else {
                    remainingFarmingTime = endTime.diff(currentTime);
                    const timeLeft = remainingFarmingTime.toFormat('hh:mm:ss');
                    await this.log(`Waktu tersisa untuk farming: ${timeLeft}`, 'info');
                }
            }
        } else {
            await this.log('Tidak dapat mengambil informasi saldo', 'error');
        }
        await this.getTaskKeywords();
        const dataTasks = await this.getTasks();
        if (Array.isArray(dataTasks) && dataTasks.length > 0) {
            let allTasks = [];
            const processTask = (task) => {
                allTasks.push(task);
                if (task.subTasks && Array.isArray(task.subTasks)) {
                    task.subTasks.forEach(processTask);
                }
            };

            for (const section of dataTasks) {
                if (section.tasks && Array.isArray(section.tasks)) {
                    section.tasks.forEach(processTask);
                }
                if (section.subSections && Array.isArray(section.subSections)) {
                    for (const subSection of section.subSections) {
                        if (subSection.tasks && Array.isArray(subSection.tasks)) {
                            subSection.tasks.forEach(processTask);
                        }
                    }
                }
            }

            const skipTasks = [
                "5daf7250-76cc-4851-ac44-4c7fdcfe5994",
                "3b0ae076-9a85-4090-af55-d9f6c9463b2b",
                "89710917-9352-450d-b96e-356403fc16e0",
                "220ee7b1-cca4-4af8-838a-2001cb42b813",
                "c4e04f2e-bbf5-4e31-917b-8bfa7c4aa3aa",
                "f382ec3f-089d-46de-b921-b92adfd3327a",
                "d3716390-ce5b-4c26-b82e-e45ea7eba258",
                "5ecf9c15-d477-420b-badf-058537489524",
                "d057e7b7-69d3-4c15-bef3-b300f9fb7e31",
                "a4ba4078-e9e2-4d16-a834-02efe22992e2",
                "39391eb2-f031-4954-bd8a-e7aecbb1f192",
                "d7accab9-f987-44fc-a70b-e414004e8314"
            ];

            const taskFilter = allTasks.filter(
                (task) =>
                    !skipTasks.includes(task.id) &&
                    task.status !== "FINISHED" &&
                    !task.isHidden
            );

            for (const task of taskFilter) {
                const startResult = await this.startTask(task.id);
                if (startResult) {
                    await this.log(`Telah memulai tugas: ${task.title}`, 'success');
                } else {
                    continue;
                }

                await new Promise(resolve => setTimeout(resolve, 3000));

                if (task.validationType === "KEYWORD") {
                    const keyword = this.taskKeywords[task.id];
                    if (keyword) {
                        const validateResult = await this.validateTask(task.id, keyword);
                        if (!validateResult) {
                            await this.log(`Tidak dapat memvalidasi tugas: ${task.title}`, 'error');
                            continue;
                        }
                    } else {
                        await this.log(`Tugas ${task.title} belum memiliki jawaban, lewati`, 'warning');
                        continue;
                    }
                }

                const claimResult = await this.claimTask(task.id);
                if (claimResult && claimResult.status === "FINISHED") {
                    await this.log(`Selesai mengerjakan tugas ${task.title.yellow}${`... status: sukses!`.green}`, 'success');
                } else {
                    await this.log(`Tidak dapat menerima hadiah untuk tugas: ${task.title.yellow}`, 'error');
                }
            }
        } else {
            await this.log('Tidak dapat mengambil daftar tugas atau daftar tugas kosong', 'error');
        }

        const dailyRewardResult = await this.checkDailyReward();
        if (dailyRewardResult) {
            await this.log('Telah menerima hadiah harian!', 'success');
        }

        const friendBalanceInfo = await this.checkBalanceFriend();
        if (friendBalanceInfo) {
            if (friendBalanceInfo.amountForClaim > 0) {
                await this.log(`Saldo teman: ${friendBalanceInfo.amountForClaim}`, 'info');
                const claimFriendBalanceResult = await this.claimBalanceFriend();
                if (claimFriendBalanceResult) {
                    await this.log('Telah menerima saldo teman dengan sukses!', 'success');
                }
            }
        } else {
            await this.log('Tidak dapat memeriksa saldo teman!', 'error');
        }

        if (balanceInfo && balanceInfo.playPasses > 0) {
            for (let j = 0; j < balanceInfo.playPasses; j++) {
                let playAttempts = 0;
                const maxAttempts = 10;

                while (playAttempts < maxAttempts) {
                    try {
                        const playResult = await this.playGame();
                        if (playResult) {
                            await this.log(`Mulai bermain game untuk ke-${j + 1}...`, 'success');
                            await new Promise(resolve => setTimeout(resolve, 30000));
                            const randomNumber = Math.floor(Math.random() * (300 - 250 + 1)) + 250;
                            const claimGameResult = await this.claimGame(randomNumber);
                            if (claimGameResult) {
                                await this.log(`Telah menerima hadiah game untuk ke-${j + 1} dengan sukses dengan ${randomNumber} poin!`, 'success');
                            }
                            break;
                        }
                    } catch (error) {
                        playAttempts++;
                        await this.log(`Tidak dapat bermain game untuk ke-${j + 1}, percobaan ${playAttempts}: ${error.message}`, 'warning');
                        if (playAttempts < maxAttempts) {
                            await this.log(`Mencoba lagi...`, 'info');
                            await this.Countdown(5);
                        } else {
                            await this.log(`Telah mencoba ${maxAttempts} kali tanpa berhasil, lewati putaran ini`, 'error');
                        }
                    }
                }
            }
        }

        await this.log(`Selesai memproses akun ${userInfo.username}`, 'success');

        return remainingFarmingTime || Duration.fromMillis(0);
    } catch (error) {
        await this.log(`Kesalahan tidak terduga saat memproses akun: ${error.message}`, 'error');
        return Duration.fromMillis(0);
    }
}

async function runWorker(workerData) {
    const { queryId, accountIndex, proxy } = workerData;
    const gameBot = new GameBot(queryId, accountIndex, proxy);
    try {
        const remainingTime = await Promise.race([
            gameBot.runAccount(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10 * 60 * 1000))
        ]);
        parentPort.postMessage({ accountIndex, remainingTime: remainingTime.as('seconds') });
    } catch (error) {
        parentPort.postMessage({ accountIndex, error: error.message });
    }
}

indexProxies = 0;
function getProxy(listProxies) {
    const proxy = listProxies[indexProxies];
    indexProxies++;
    if (indexProxies >= listProxies.length) {
        indexProxies = 0;
    }
    return proxy;
}

function formatProxy(proxy) {
    // dari ip:port:user:pass ke http://user:pass@ip:port
    // jika format http, cukup pertahankan
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

async function main() {
    this.indexProxies = 0;
    const proxyFile = path.join(`${DATA_DIR}/proxy.txt`);
    const proxies = fs.readFileSync(proxyFile, 'utf8')
        .replace(/\r/g, '')
        .split('\n')
        .filter(Boolean);

    const maxThreads = 10;
    while (true) {
        let currentIndex = 0;
        let minRemainingTime = Infinity;
        const errors = [];

        const dataFile = path.join(`${DATA_DIR}/blum.txt`);
        const queryIds = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (currentIndex < queryIds.length) {
            console.log(`Jika sudah berusaha, jangan takut; jika sudah takut, jangan berusaha!`.magenta);
            const workerPromises = [];

            const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
            for (let i = 0; i < batchSize; i++) {
                const proxy = formatProxy(getProxy(proxies));
                const worker = new Worker(__filename, {
                    workerData: {
                        queryId: queryIds[currentIndex],
                        accountIndex: currentIndex,
                        proxy: proxy
                    }
                });

                workerPromises.push(
                    new Promise((resolve) => {
                        worker.on('message', (message) => {
                            if (message.error) {
                                errors.push(`Akun ${message.accountIndex}: ${message.error}`);
                            } else {
                                const { remainingTime } = message;
                                if (remainingTime < minRemainingTime) {
                                    minRemainingTime = remainingTime;
                                }
                            }
                            resolve();
                        });
                        worker.on('error', (error) => {
                            errors.push(`Kesalahan worker untuk akun ${currentIndex}: ${error.message}`);
                            resolve();
                        });
                        worker.on('exit', (code) => {
                            if (code !== 0) {
                                errors.push(`Worker untuk akun ${currentIndex} keluar dengan kode: ${code}`);
                            }
                            resolve();
                        });
                    })
                );

                currentIndex++;
            }

            await Promise.all(workerPromises);

            if (errors.length > 0) {
                errors.length = 0;
            }

            if (currentIndex < queryIds.length) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        const gameBot = new GameBot(null, 0, proxies[0]);
        await gameBot.Countdown(6000);
    }
}

if (isMainThread) {
    main().catch(error => {
        console.error('Terjadi kesalahan:', error);
        process.exit(1);
    });
} else {
    runWorker(workerData);
}
