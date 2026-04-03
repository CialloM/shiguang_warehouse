// 宜宾学院(yibinu.edu.cn) 拾光课程表适配脚本
// 适配：理论课(新版教务) + 实验课(实践教学平台) 双课表合并导入
// 完全自动：理论课从 localStorage 获取学号，通过参数传递给实验课，无需依赖 Cookie



// ==================== 核心工具 ====================
function encodeParams(obj) {
  return btoa(encodeURIComponent(JSON.stringify(obj)));
}
function decodeParams(str) {
  if (!str) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(str)));
  } catch (e) {
    return null;
  }
}
function getUrlParam(key) {
  const fullUrl = window.location.href;
  const paramStr = fullUrl.includes('?') ? fullUrl.split('?')[1] : '';
  const params = new URLSearchParams(paramStr);
  return params.get(key);
}
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// ==================== 通用工具函数 ====================
function parseWeeks(weekStr) {
    if (!weekStr) return [];
    const weekSets = weekStr.split(',');
    let weeks = [];
    for (const set of weekSets) {
        const trimmedSet = set.trim();
        const rangeMatch = trimmedSet.match(/(\d+)-(\d+)周/);
        const singleMatch = trimmedSet.match(/^(\d+)周/);
        let start = 0, end = 0, processed = false;

        if (rangeMatch) {
            start = Number(rangeMatch[1]);
            end = Number(rangeMatch[2]);
            processed = true;
        } else if (singleMatch) {
            start = end = Number(singleMatch[1]);
            processed = true;
        }
        
        if (processed) {
            const isSingle = trimmedSet.includes('(单)');
            const isDouble = trimmedSet.includes('(双)');
            for (let w = start; w <= end; w++) {
                if (isSingle && w % 2 === 0) continue;
                if (isDouble && w % 2 !== 0) continue;
                weeks.push(w);
            }
        }
    }
    return [...new Set(weeks)].sort((a, b) => a - b);
}

function sortCourses(courseList) {
    return courseList.sort((a, b) =>
        a.day - b.day ||
        a.startSection - b.startSection ||
        a.name.localeCompare(b.name, 'zh-CN')
    );
}

// ==================== 解析函数 ====================
function parseTheoryJson(jsonData) {
    console.log("JS: 解析理论课数据...");
    if (!jsonData || jsonData.code !== "0" || !jsonData.datas?.xskcb?.rows) {
        console.warn("JS: 理论课数据格式错误");
        return [];
    }
    const rawList = jsonData.datas.xskcb.rows;
    const courseList = [];
    
    for (const item of rawList) {
        if (!item.KCM || !item.SKJS || !item.JASMC || !item.SKXQ || !item.KSJC || !item.JSJC || !item.ZCMC) continue;
        const weeks = parseWeeks(item.ZCMC);
        if (weeks.length === 0) continue;

        const start = Number(item.KSJC);
        const end = Number(item.JSJC);
        const day = Number(item.SKXQ);
        if (isNaN(day) || day < 1 || day > 7 || start > end) continue;

        courseList.push({
            name: item.KCM.trim(),
            teacher: item.SKJS.trim(),
            position: item.JASMC.trim(),
            day: day,
            startSection: start,
            endSection: end,
            weeks: weeks
        });
    }
    return sortCourses(courseList);
}

// ==================== 签名生成器 ====================
function SignatureGenerator() {
    const secret = {
        signature: "zxtd_256-bit-secret-key-2025-8-7",
        zhxhsign: "zhxintd201020301"
    };

    const generateNonce = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 20; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const hmacSha512 = async (message, key) => {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const messageData = encoder.encode(message);
        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const hmacSha256 = async (message, key) => {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const messageData = encoder.encode(message);
        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    };

    const generateSignature = async () => {
        const timestamp = Date.now();
        const nonce = generateNonce();
        const signString = `${timestamp}-${nonce}`;
        const signature = await hmacSha512(signString, secret.signature);
        return { timestamp, nonce, signature };
    };

    const generateZhxhsign = async (data) => {
        const paramMap = {};
        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                let value = data[key];
                if (value !== undefined && value !== null && value !== '') {
                    if (!paramMap[key]) paramMap[key] = [];
                    paramMap[key].push(String(value));
                }
            }
        }
        const sortedKeys = Object.keys(paramMap).sort();
        let signStr = '';
        for (let key of sortedKeys) {
            const values = paramMap[key];
            values.sort();
            for (let value of values) {
                signStr += key + '=' + value;
            }
        }
        return await hmacSha256(signStr, secret.zhxhsign);
    };

    const generateAll = async (data) => {
        const signatureData = await generateSignature();
        const zhxhsign = await generateZhxhsign(data);
        return {
            timestamp: signatureData.timestamp,
            random: signatureData.timestamp,
            nonce: signatureData.nonce,
            signature: signatureData.signature,
            zhxhsign: zhxhsign
        };
    };

    return { generateAll };
}


// ==================== 自动获取 key1 (通过隐藏 iframe 模拟 SSO) ====================
async function autoGetKey1() {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'https://scjx2.yibinu.edu.cn/zxcas/';
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                reject(new Error('超时，请确认已登录过统一认证平台'));
                iframe.remove();
            }
        }, 15000);

        // 轮询检测 iframe 的 URL（同源时才能访问）
        const interval = setInterval(() => {
            if (resolved) return;
            try {
                const iframeUrl = iframe.contentWindow.location.href;
                const match = iframeUrl.match(/id=([^&]+)/);
                if (match) {
                    const key1 = decodeURIComponent(match[1]);
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolved = true;
                    iframe.remove();
                    resolve(key1);
                }
            } catch (e) {
                // 跨域无法访问，忽略，继续等待
            }
        }, 200);

        iframe.onload = () => {
            if (resolved) return;
            try {
                const iframeUrl = iframe.contentWindow.location.href;
                const match = iframeUrl.match(/id=([^&]+)/);
                if (match) {
                    const key1 = decodeURIComponent(match[1]);
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolved = true;
                    iframe.remove();
                    resolve(key1);
                }
            } catch (e) {}
        };
        document.body.appendChild(iframe);
    });
}

// ==================== 实验课请求 ====================
async function fetchExperimentCourses(studentId,yearterm) {
    AndroidBridge.showToast("正在获取实验课数据...");
    try {
        const url = "https://scjx2.yibinu.edu.cn/teach/teach/stuTime/listStuTimePage";
        const bodyData = {
            "yearterm": yearterm,
            "currpage": 1,
            "pagesize": 500
        };
        const signatures = await SignatureGenerator().generateAll(bodyData);
        const authorization = sessionStorage.getItem('key1');
        if (!authorization) {
            console.error('未找到 authorization');
            AndroidBridge.showToast("未找到登录凭证，请重新登录");
            return [];
        }
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*",
                "authorization": authorization,
                "zhxhsign": signatures.zhxhsign,
                "signature": signatures.signature,
                "timestamp": signatures.timestamp.toString(),
                "random": signatures.random.toString(),
                "nonce": signatures.nonce,
                "currentroutepath": "/6001/modules/teach/stu/result/result",
                "userId": studentId,
                "x-requested-with": "XMLHttpRequest"
            },
            body: JSON.stringify(bodyData),
            credentials: "include"
        });
        if (!res.ok) {
            const errorData = await res.json();
            console.error("错误响应:", errorData);
            AndroidBridge.showToast(`实验课错误：${errorData.msg || res.status}`);
            return [];
        }
        const data = await res.json();
        console.log("成功获取数据，原始条数:", data.result?.list?.length || 0);
        return parseExperimentCoursesData(data);
    } catch (e) {
        console.error(e);
        AndroidBridge.showToast("实验课获取失败: " + e.message);
        return [];
    }
}

function parseExperimentCoursesData(jsonData) {
    console.log("JS: 解析实验课数据...");
    if (!jsonData || jsonData.code !== 200 || !jsonData.result?.list) {
        AndroidBridge.showToast("未获取到实验课数据！");
        return [];
    }
    const rawList = jsonData.result.list;
    const groupMap = new Map();
    for (const item of rawList) {
        const courseName = item.course_name?.trim();
        const teacher = item.teacher_name?.trim();
        const room = item.room_name?.trim().replace(/\t/g, '');
        const day = Number(item.week_day);
        const start = Number(item.jc_start);
        const end = Number(item.jc_end);
        const week = Number(item.week);
        if (!courseName || !teacher || !day || !start || !end || !week) continue;
        if (day < 1 || day > 7 || start > end) continue;
        const key = `${courseName}_${teacher}_${day}_${start}_${end}`;
        if (!groupMap.has(key)) {
            groupMap.set(key, { 
                name: courseName, 
                teacher: teacher, 
                position: room, 
                day: day, 
                startSection: start, 
                endSection: end, 
                weeks: new Set() 
            });
        }
        groupMap.get(key).weeks.add(week);
    }
    const courseList = [];
    for (const item of groupMap.values()) {
        item.weeks = [...item.weeks].sort((a, b) => a - b);
        courseList.push(item);
    }

    return sortCourses(courseList);
}

// ==================== 理论课请求 ====================
async function fetchTheoryCourses(yearTermCache, studentId) {
    AndroidBridge.showToast("正在获取理论课数据...");
    
    
    try {
        // 第一步：访问 appShow 页面，获取有效的会话
        const appShowUrl = 'https://ehall.yibinu.edu.cn/appShow?appId=4770397878132218';
        const appShowRes = await fetch(appShowUrl, {
            method: 'GET',
            credentials: 'include',
            redirect: 'follow',  // 自动跟随重定向
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        // 最终重定向后的 URL 
        const finalUrl = appShowRes.url;
        console.log('最终 URL:', finalUrl);
        

        // 先访问 finalUrl 让会话建立
        await fetch(finalUrl, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // 请求课表数据
        const res = await fetch("https://ehall.yibinu.edu.cn/jwapp/sys/wdkb/modules/xskcb/xskcb.do", {
            method: "POST",
            headers: {
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": finalUrl
            },
            body: "XNXQDM=" + yearTermCache + "&XH=" + studentId,
            credentials: "include"
        });
        if (!res.ok) throw new Error("请求失败：" + res.status);
        const text = await res.text();
        const data = JSON.parse(text);
        return parseTheoryJson(data);
    } catch (e) {
        console.error("错误：", e);
        AndroidBridge.showToast("获取课表失败：" + e.message);
        return [];
    }
}

// ==================== 保存配置 ====================
async function saveAllCourses(courses) {

    try { 
        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(courses, null, 2)); 
        return true; 
    }
    catch (e) { 
        AndroidBridge.showToast("课程保存失败"); 
        return false; 
    }
}
async function saveConfig() {
    const config = { semesterTotalWeeks: 18, firstDayOfWeek: 1 };
    await window.AndroidBridgePromise.saveCourseConfig(JSON.stringify(config));
}

function getTimeSlots(){
    const TimeSlots = [
    { number: 1, startTime: "08:30", endTime: "09:15" },
    { number: 2, startTime: "09:20", endTime: "10:05" },
    { number: 3, startTime: "10:25", endTime: "11:10" },
    { number: 4, startTime: "11:15", endTime: "12:00" },
    { number: 5, startTime: "14:30", endTime: "15:15" },
    { number: 6, startTime: "15:20", endTime: "16:05" },
    { number: 7, startTime: "16:25", endTime: "17:10" },
    { number: 8, startTime: "17:15", endTime: "18:00" },
    { number: 9, startTime: "19:00", endTime: "19:45" },
    { number: 10, startTime: "19:50", endTime: "20:35" },
    { number: 11, startTime: "20:45", endTime: "21:30" },
    { number: 12, startTime: "22:05", endTime: "22:50" }
    ];
    return TimeSlots;
}

async function importTimeSlots() {
    try { 
        await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(getTimeSlots())); 

    } catch (e) {}
}

// ==================== 用户交互 ====================
async function promptUserToStart() {
    return await window.AndroidBridgePromise.showAlert(
        "宜宾学院课表导入",
        "导入流程：1.在智慧大厅执行脚本 → 2.在实验教学登录页执行脚本 → 3.自动完成",
        "开始导入"
    );
}
async function askImportExperiment() {
    const options = ["导入实验课", "仅保存理论课"];
    const index = await window.AndroidBridgePromise.showSingleSelection(
        "理论课导入完成",
        JSON.stringify(options),
        0
    );
    return index === 0;
}
async function getAcademicYear() {
    const currentYear = new Date().getFullYear().toString();
    return await window.AndroidBridgePromise.showPrompt(
        "选择学年",
        "请输入起始学年（如2025-2026填2025）:",
        currentYear,
        "validateYearInput"
    );
}
function validateYearInput(input) {
    return /^[0-9]{4}$/.test(input) ? false : "请输入四位数字学年！";
}
async function selectSemester() {
    const semesters = ["第一学期", "第二学期"];
    return await window.AndroidBridgePromise.showSingleSelection(
        "选择学期",
        JSON.stringify(semesters), 
        0
    );
}
async function reminderMotion() {
    return await window.AndroidBridgePromise.showAlert(
        "操作提醒",
        "请在跳转页面后就再次点击执行，不需要您点击登录",
        "知道了"
    );
}

// ==================== 页面判断 ====================
function isTheoryLoginPage() {
    return window.location.href.includes("authserver.yibinu.edu.cn/login");
}
function isExpLoginPage() {
    return window.location.href.includes("scjx2.yibinu.edu.cn/TEACH/#/login");
}

// ==================== 1. 理论课流程 ====================
async function runImportFlow() {
    if (isTheoryLoginPage()) { 
        AndroidBridge.showToast("请先登录智慧教学系统！"); 
        return; 
    }
    let studentId = localStorage.getItem('ampUserId');
    if (!studentId) {
        AndroidBridge.showToast("未检测到学号，请确保已在大厅主页");
        return;
    }
    if (!await promptUserToStart()) return;
    const year = await getAcademicYear(); 
    if (!year) return;
    const semesterIdx = await selectSemester(); 
    if (semesterIdx === null) return;

    let yearTermCache = `${year}-${Number(year)+1}-${semesterIdx+1}`;

    let mainCourses = await fetchTheoryCourses(yearTermCache, studentId);
    if (mainCourses.length === 0) return;

    const needExp = await askImportExperiment();
    if (needExp) {
        // 将学号也传递给实验课页面
        await reminderMotion();
        const params = {
            mainCourses: mainCourses,
            yearTermCache: yearTermCache,
            studentId: studentId
        };
        const jumpUrl = `https://scjx2.yibinu.edu.cn/TEACH/#/login?courseData=${encodeParams(params)}`;

        window.location.href = jumpUrl;
        return;
    }
    await saveConfig(); 
    await importTimeSlots(); 
    await saveAllCourses(mainCourses);
    AndroidBridge.showToast(`导入成功！共 ${mainCourses.length} 门理论课`);
    AndroidBridge.notifyTaskCompletion();
}

// ==================== 2. 实验课登录页：自动获取key1并从参数获取学号，直接导入 ====================
async function runExpAutoMerge() {
    const paramData = getUrlParam('courseData');
    const decodeData = decodeParams(paramData);
    if (!decodeData) {
        AndroidBridge.showToast("未检测到理论课参数，请重新从理论课流程开始！");
        return;
    }
    const { mainCourses: theoryCourses, yearTermCache: ytc, studentId } = decodeData;
    if (!theoryCourses || !ytc || !studentId) {
        AndroidBridge.showToast("参数不完整，请重新导入理论课！");
        return;
    }
    


    try {
        const key1 = await autoGetKey1();
        sessionStorage.setItem('key1', key1);
        

        const expCourses = await fetchExperimentCourses(studentId,ytc);
        const allCourses = sortCourses([...theoryCourses, ...expCourses]);
        
        await saveConfig();
        await importTimeSlots();
        await saveAllCourses(allCourses);
        
        AndroidBridge.showToast(`导入成功！理论课${theoryCourses.length}门 + 实验课${expCourses.length}门`);
        AndroidBridge.notifyTaskCompletion();
    } catch (err) {
        console.error(err);
        AndroidBridge.showToast("自动导入失败！请退出重新开始流程");
    }
}

// ==================== 脚本入口 ====================
(async () => {
    if (isExpLoginPage()) {
        await runExpAutoMerge();
    } else {
        await runImportFlow();
    }
})();