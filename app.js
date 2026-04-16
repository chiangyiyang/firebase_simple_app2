import {
    auth, db, storage
} from './firebase-config.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    getDocs,
    getDoc,
    deleteDoc,
    doc,
    setDoc
} from "firebase/firestore";
import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "firebase/storage";

// --- DOM 元素選取 ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authSection = document.getElementById('user-info');
const loginPrompt = document.getElementById('login-prompt');
const mainContent = document.getElementById('main-content');
const uploadForm = document.getElementById('upload-form');
const dataList = document.getElementById('data-list');
const downloadAllBtn = document.getElementById('download-all-btn');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressContainer = document.getElementById('progress-container');
const usersSection = document.getElementById('users-section');
const usersList = document.getElementById('users-list');
const adminSection = document.getElementById('admin-section');
const whitelistForm = document.getElementById('whitelist-form');
const whitelistInput = document.getElementById('whitelist-input');
const whitelistTags = document.getElementById('whitelist-tags');

let currentUser = null;

// --- 身份驗證監聽 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // 使用者已登入
        currentUser = user;
        showLoggedInUI(user);
        listenToData();
        listenToUsers();
    } else {
        // 使用者已登出
        currentUser = null;
        showLoggedOutUI();
    }
});

function showLoggedInUI(user) {
    document.getElementById('user-name').textContent = user.displayName;
    document.getElementById('user-photo').src = user.photoURL;
    authSection.classList.remove('hidden');
    loginPrompt.classList.add('hidden');
    mainContent.classList.remove('hidden');
    usersSection.classList.remove('hidden');

    // 管理員檢查
    if (user.email === 'chiangyiyang@gmail.com') {
        adminSection.classList.remove('hidden');
        listenToWhitelist();
    }
}

function showLoggedOutUI() {
    authSection.classList.add('hidden');
    loginPrompt.classList.remove('hidden');
    mainContent.classList.add('hidden');
    usersSection.classList.add('hidden');
    adminSection.classList.add('hidden');
}

// --- 登入與登出事件 ---
loginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // 檢查白名單
        const isAllowed = await checkWhitelist(user.email);
        if (!isAllowed) {
            alert(`抱歉，您的 Email (${user.email}) 未在授權名單中。`);
            await signOut(auth);
            return;
        }

        // 儲存/更新使用者資訊
        await saveUserProfile(user);
        
        // 成功後啟動監聽成員
        listenToUsers();

    } catch (error) {
        console.error("登入失敗:", error);
        alert("登入失敗，請檢查控制台錯誤訊息。");
    }
});

// --- 白名單與成員管理邏輯 ---

async function checkWhitelist(email) {
    // 預設授權 chiangyiyang@gmail.com
    if (email === 'chiangyiyang@gmail.com') return true;

    try {
        const whitelistDoc = await getDoc(doc(db, "whitelist", email));
        return whitelistDoc.exists();
    } catch (err) {
        console.error("檢查白名單失敗:", err);
        return false;
    }
}

async function saveUserProfile(user) {
    try {
        await setDoc(doc(db, "users", user.uid), {
            displayName: user.displayName,
            photoURL: user.photoURL,
            email: user.email,
            lastLogin: serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error("更新使用者資訊失敗:", err);
    }
}

function listenToUsers() {
    const q = query(collection(db, "users"), orderBy("lastLogin", "desc"));
    
    onSnapshot(q, (snapshot) => {
        usersList.innerHTML = '';
        if (snapshot.empty) {
            usersList.innerHTML = '<p class="empty-msg">尚無成員資料</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const userData = doc.data();
            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            userCard.innerHTML = `
                <img src="${userData.photoURL}" class="user-avatar" alt="${userData.displayName}">
                <span class="user-name-small">${userData.displayName}</span>
            `;
            usersList.appendChild(userCard);
        });
    });
}

// --- 管理員專屬功能實作 ---

function listenToWhitelist() {
    // 監聽 whitelist 集合
    onSnapshot(collection(db, "whitelist"), (snapshot) => {
        whitelistTags.innerHTML = '';
        if (snapshot.empty) {
            whitelistTags.innerHTML = '<p class="empty-msg">目前無其他授權名單</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const email = doc.id;
            const tag = document.createElement('div');
            tag.className = 'whitelist-tag';
            tag.innerHTML = `
                <span>${email}</span>
                <button class="btn-remove-tag" onclick="removeFromWhitelist('${email}')">&times;</button>
            `;
            whitelistTags.appendChild(tag);
        });
    });
}

// 新增白名單
whitelistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = whitelistInput.value.trim().toLowerCase();
    
    if (!email) return;

    try {
        // 以 Email 作為文件 ID 存入 whitelist 集合
        await setDoc(doc(db, "whitelist", email), {
            addedAt: serverTimestamp(),
            addedBy: currentUser.email
        });
        whitelistInput.value = '';
        alert(`已成功將 ${email} 加入白名單。`);
    } catch (err) {
        console.error("新增白名單失敗:", err);
        alert("新增失敗，請檢查權限。");
    }
});

// 刪除白名單
window.removeFromWhitelist = async (email) => {
    if (email === 'chiangyiyang@gmail.com') {
        alert("無法刪除主要管理員帳號！");
        return;
    }

    if (!confirm(`確定要取消 ${email} 的授權嗎？`)) return;

    try {
        await deleteDoc(doc(db, "whitelist", email));
        alert("授權已移除。");
    } catch (err) {
        console.error("刪除失敗:", err);
        alert("移除失敗。");
    }
};

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// --- 資料上傳處理 ---
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = document.getElementById('image-input').files[0];
    const description = document.getElementById('desc-input').value;

    if (!file || !currentUser) return;

    // 1. 建立 Storage 參照 (加上時間戳記避免檔名重複)
    const storageRef = ref(storage, `images/${currentUser.uid}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    progressContainer.classList.remove('hidden');

    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = Math.round(progress) + '%';
        },
        (error) => {
            console.error("上傳錯誤:", error);
            alert("圖片上傳失敗！");
        },
        async () => {
            // 上傳成功，取得下載 URL
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            // 2. 將資訊存入 Firestore
            try {
                await addDoc(collection(db, "uploads"), {
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    imageUrl: downloadURL,
                    description: description,
                    fileName: file.name,
                    createdAt: serverTimestamp()
                });

                // 重置表單
                uploadForm.reset();
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                alert("資料上傳成功！");
            } catch (err) {
                console.error("存入資料庫失敗:", err);
            }
        }
    );
});

// --- 監聽資料即時更新 ---
function listenToData() {
    const q = query(collection(db, "uploads"), orderBy("createdAt", "desc"));

    // 使用 onSnapshot 實現即時更新
    onSnapshot(q, (snapshot) => {
        dataList.innerHTML = '';

        if (snapshot.empty) {
            dataList.innerHTML = '<p class="empty-msg">目前尚無資料</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            renderDataItem(data, doc.id);
        });
    });
}

function renderDataItem(data, id) {
    const div = document.createElement('div');
    div.className = 'data-item';

    const time = data.createdAt ? data.createdAt.toDate().toLocaleString() : '上傳中...';

    div.innerHTML = `
        <img src="${data.imageUrl}" alt="上傳圖片" loading="lazy">
        <div class="data-content">
            <p class="data-desc">${data.description}</p>
            <p class="data-time">${time} by ${data.userName}</p>
            <button class="btn-delete" onclick="deleteEntry('${id}')">刪除資料</button>
        </div>
    `;
    dataList.appendChild(div);
}

// 刪除功能
window.deleteEntry = async (id) => {
    if (!confirm("確定要刪除這筆資料嗎？(此操作僅刪除資料庫記錄)")) return;

    try {
        await deleteDoc(doc(db, "uploads", id));
        alert("資料已刪除！");
    } catch (err) {
        console.error("刪除失敗:", err);
        alert("刪除失敗，請檢查規則設定。");
    }
};

// --- ZIP 打包下載實作 ---
downloadAllBtn.addEventListener('click', async () => {
    if (!currentUser) return;

    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = '正在準備 ZIP 檔案...';

    const zip = new JSZip();
    const folder = zip.folder("my_uploads");

    try {
        // 從 Firestore 取得所有資料
        const q = query(collection(db, "uploads"));

        // 遍歷所有上傳資料並下載圖片
        const downloadPromises = [];

        // 注意：這裡使用 snapshot 可能會有問題，建議改用 getDocs 或在 Promise 中處理
        // 為了簡單起見，我們另外執行一次一次性的讀取 (這裡簡化處理)

        // 使用 async/await 處理循環下載
        const querySnapshot = await getDocs(q);

        for (const doc of querySnapshot.docs) {
            const data = doc.data();
            const fileNameBase = `${Date.now()}_${data.fileName}`;

            // 下載圖片 Blob
            const p = fetch(data.imageUrl)
                .then(res => res.blob())
                .then(blob => {
                    folder.file(fileNameBase, blob);
                    folder.file(`${fileNameBase}.txt`, data.description);
                });
            downloadPromises.push(p);
        }

        await Promise.all(downloadPromises);

        // 產生 ZIP 檔案並提供下載
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "firebase_data_backup.zip");

    } catch (error) {
        console.error("下載 ZIP 失敗:", error);
        alert("打包過程中發生錯誤。");
    } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = '打包下載所有 ZIP';
    }
});
