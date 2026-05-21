// This ensures the script runs only after the page is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // Select the buttons using the IDs we added
    const heroBtn = document.getElementById('hero-start-btn');
    const footerBtn = document.getElementById('footer-start-btn');
    const inscriptionBtnadmin = document.getElementById('btn-inscription2')
    const inscriptionBtnelecteur = document.getElementById('btn-inscription1')
    const loginbutton = document.getElementById('btn-login')

    // Function to handle the navigation
    const goToEspace = () => {
        console.log("Navigation triggered!");
        window.location.href = 'Espace-Electeur-Administrateur.html';
    };

    const goToLogin1 = () => {
        console.log("Navigation triggered!");
        window.location.href = 'inscription-electeur.html';
    };

    const goToLogin2 = () => {
        console.log("Navigation triggered!");
        window.location.href = 'inscription-administrateur.html';
    };

    const login1 = () => {
       console.log("Navigation triggered!");
       window.location.href = 'Espace-electeur.html'
    }


    if (heroBtn) {
        heroBtn.addEventListener('click', goToEspace);
    }

    if (footerBtn) {
        footerBtn.addEventListener('click', goToEspace);
    }

    if (inscriptionBtnadmin) {
        inscriptionBtnadmin.addEventListener('click', goToLogin2)
    }

    if (inscriptionBtnelecteur) {
         inscriptionBtnelecteur.addEventListener('click', goToLogin1)
    }

    if (loginbutton) {
        loginbutton.addEventListener('click', login1)
    }
});