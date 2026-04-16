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
    deleteDoc,
    doc
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

let currentUser = null;

// --- 身份驗證監聽 ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // 使用者已登入
        currentUser = user;
        showLoggedInUI(user);
        listenToData();
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
}

function showLoggedOutUI() {
    authSection.classList.add('hidden');
    loginPrompt.classList.remove('hidden');
    mainContent.classList.add('hidden');
}

// --- 登入與登出事件 ---
loginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("登入失敗:", error);
        alert("登入失敗，請檢查控制台錯誤訊息。");
    }
});

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
