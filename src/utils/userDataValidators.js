import egyptLocations from '../data/egyptLocations.js';

export function validateUsername(username) {
    if (username.length < 5 || username.length > 30) {
        return "Username must be between 5 and 30 characters.";
    }
    if (/\s/.test(username)) {
        return "username cannot contain spaces.";
    }
    return null;
}

export function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return "Invalid email format.";
    }
    return null;
}

export function validatePassword(password) {
    if (password.length < 6) {
        return "Password must be at least 6 characters.";
    }

    if (/\s/.test(password)) {
        return "password cannot contain spaces.";
    }
    return null;
}

export function validateRole(role) {
    const allowedRoles = ["customer", "vendor", "admin"];

    if (!allowedRoles.includes(role)) {
        return "Invalid role.";
    }

    return null;
}

export function validatePhoneNumber(phoneNumber, isUpdate = false) {
    if (isUpdate && phoneNumber === undefined) return null;
    if (!phoneNumber || phoneNumber.trim() === "") return "phoneNumber is required.";
    if (!/^\+?[0-9]{7,15}$/.test(phoneNumber.trim())) return "Invalid phoneNumber format.";
    return null;
}

export function validateAddress(address, isUpdate = false) {
    if (isUpdate && address === undefined) return null;
    if (!address) return "address is required.";
    const { governorate, city, neighborhood, detailedAddress } = address;
    
    if (!isUpdate || governorate !== undefined) {
        if (!governorate?.trim()) return "address: governorate is required.";
    }
    if (!isUpdate || city !== undefined) {
        if (!city?.trim()) return "address: city is required.";
    }
    if (!isUpdate || neighborhood !== undefined) {
        if (!neighborhood?.trim()) return "address: neighborhood is required.";
    }
    if (!isUpdate || detailedAddress !== undefined) {
        if (!detailedAddress?.trim()) return "address: detailedAddress is required.";
        if (detailedAddress.trim().length > 200) return "address: detailedAddress max 200 characters.";
    }

    if (governorate || city || neighborhood) {
        const govTrimmed = governorate?.trim();
        const cityTrimmed = city?.trim();
        const neighborhoodTrimmed = neighborhood?.trim();

        let foundGov;
        if (govTrimmed) {
            foundGov = egyptLocations.find(g =>
                g.governorateName.toLowerCase().includes(govTrimmed.toLowerCase()) ||
                g.governorateId.toLowerCase() === govTrimmed.toLowerCase()
            );
            if (!foundGov) return `address: '${govTrimmed}' is not a valid or supported governorate.`;
        }

        let foundCity;
        if (cityTrimmed) {
            const targetGov = foundGov || egyptLocations.find(g => g.cities.some(c => c.cityName.toLowerCase() === cityTrimmed.toLowerCase() || c.cityId.toLowerCase() === cityTrimmed.toLowerCase()));
            
            if (targetGov) {
                foundCity = targetGov.cities.find(c =>
                    c.cityName.toLowerCase() === cityTrimmed.toLowerCase() || 
                    c.cityId.toLowerCase() === cityTrimmed.toLowerCase()
                );
            }
            if (!foundCity) return `address: City '${cityTrimmed}' is invalid or does not belong to the selected governorate.`;
        }

        if (neighborhoodTrimmed) {
            const targetCity = foundCity || (foundGov && foundGov.cities[0]); 
            if (targetCity) {
                const isNeighborhoodValid = targetCity.neighborhoods.some(n =>
                    n.toLowerCase().includes(neighborhoodTrimmed.toLowerCase())
                );
                if (!isNeighborhoodValid) {
                    return `address: Neighborhood '${neighborhoodTrimmed}' is invalid or does not exist inside ${targetCity.cityName}.`;
                }
            }
        }
    }

    return null;
}

export function validateShopName(shopName, isUpdate = false) {
    if (isUpdate && shopName === undefined) return null;
    if (!shopName?.trim()) return "Shop name is required.";
    if (shopName.trim().length < 3 || shopName.trim().length > 50)
        return "Shop name must be between 3 and 50 characters.";
    return null;
}

export function validateTaxNumber(taxNumber) {
    if (!taxNumber?.trim()) return "taxNumber is required.";
    return null;
}

export function validateName(name, isUpdate = false) {
    if (isUpdate && name === undefined) return null;
    if (!name) return "name is required.";
    
    const { firstName, lastName } = name;
    const NAME_REGEX = /^[\p{L}][\p{L}\p{M}'-]*([\s][\p{L}\p{M}'-]+)*$/u;

    if (!isUpdate || firstName !== undefined) {
        if (!firstName?.trim()) return "name: firstName is required.";
        if (firstName.trim().length < 3 || firstName.trim().length > 50)
            return "name: firstName must be between 3 and 50 characters.";
        if (!NAME_REGEX.test(firstName.trim()))
            return "name: firstName contains invalid characters.";
    }

    if (!isUpdate || lastName !== undefined) {
        if (!lastName?.trim()) return "name: lastName is required.";
        if (lastName.trim().length < 3 || lastName.trim().length > 50)
            return "name: lastName must be between 3 and 50 characters.";
        if (!NAME_REGEX.test(lastName.trim()))
            return "name: lastName contains invalid characters.";
    }
    
    return null;
}