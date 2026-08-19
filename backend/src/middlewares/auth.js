const jwt = require('jsonwebtoken');

function verifierToken(req, res, next) {
  const enTete = req.headers.authorization;
  if (!enTete || !enTete.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  const token = enTete.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.utilisateur = payload;
    next();
  } catch (erreur) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

function autoriserRoles(...rolesAutorises) {
  return (req, res, next) => {
    if (!rolesAutorises.includes(req.utilisateur.role)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    next();
  };
}

module.exports = { verifierToken, autoriserRoles };