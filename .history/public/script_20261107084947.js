function switchTab(tabName, element) {
    // 1. Saari screens se active class remove karo aur display none set karo
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    
    // 2. Active target screen highlight karo
    let target = document.getElementById(tabName + '-screen');
    if (!target) {
        target = document.getElementById(tabName);
    }
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
    }
    
    // 3. Navigation item state toggling
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }
    
    // 4. Update Header Title
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
        titleEl.innerText = tabName.toUpperCase();
    }
}

function selectMarker(btn) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.action-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#aaa';
        b.style.borderColor = '#222';
    });
    btn.classList.add('active');
    btn.style.color = '#fff';
    btn.style.borderColor = '#333';
}

async function resetDevice() {
    alert("Device reset successfully!");
}

async function logout() {
    location.reload();
}