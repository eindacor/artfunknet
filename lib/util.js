getDefaultProfileImageId = function() {
    try {
        return profilePhotos.findOne({"original.name": "other.png"})._id;
    } 

    catch(e) {
        //Return null if there was a problem getting the profile photo id instead of crashing
        console.log("util.js: " + e.message);
        return;
    }
}

setDefaultPhotos = function(){
    var fs = Npm.require('fs');

    try {
        var default_male = fs.readFileSync('./assets/app/male.png');

        var newFile = new FS.File();
        newFile.attachData(default_male, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('male.png');
            profilePhotos.insert(newFile);
        });

        var default_female = fs.readFileSync('./assets/app/female.png');

        newFile = new FS.File();
        newFile.attachData(default_female, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('female.png');
            profilePhotos.insert(newFile);
        });

        var default_other = fs.readFileSync('./assets/app/other.png');

        newFile = new FS.File();
        newFile.attachData(default_other, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('other.png');
            profilePhotos.insert(newFile);
        });

        var default_randy = fs.readFileSync('./assets/app/randy.jpg');

        newFile = new FS.File();
        newFile.attachData(default_randy, {type: 'image/jpg'}, function(error){
            //if(error) throw error;
            newFile.name('randy.jpg');
            profilePhotos.insert(newFile);
        });
    }

    catch(error) {
        console.log("default photo error: " + error.message);
    }
}

isAdmin = function(userId){
    return ((getUserType(userId) == "admin"));
}

getCommaSeparatedValue = function(value) {
    if (isNaN(value)) {
        return "";
    }

    else {
        var parts = value.toString().split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }
}

getCountdownString = function(milliseconds) {
    var hours = Math.floor(milliseconds / 3600000);
    var minutes = Math.floor((milliseconds - (hours * 3600000)) / 60000);
    var seconds = Math.floor((milliseconds - (minutes * 60000) - (hours * 3600000)) / 1000);

    var hours_string = (hours < 10 ? "0" + hours : hours.toString());
    var minutes_string = (minutes < 10 ? "0" + minutes : minutes.toString()); 
    var seconds_string = (seconds < 10 ? "0" + seconds : seconds.toString()); 
    return hours_string + ":" + minutes_string + ":" + seconds_string;
}

getTimeString = function(date_object) {
    try {
        var date = date_object._d;
        var date_string = ((date.getMonth()+1) + "/" + date.getDate() + "/" + date.getFullYear());
        var hours = (date.getHours() % 12 == 0 ? 12 : date.getHours() % 12);
        var minutes = (date.getMinutes() < 10 ? "0" +  date.getMinutes() : date.getMinutes());
        var am_pm = (date.getHours() > 11 ? "pm" : "am");
        date_string += (", " + hours + ":" + minutes + " " + am_pm);
        
        return date_string;
    }

    catch(error) {
        console.log(error.message);
        return "undefined";
    }
}

getAmountFromInput = function(amount_string) {
    var no_commas = amount_string.replace(",", "");
    var no_dollars = no_commas.replace("$", "");
    if (isNaN(no_dollars))
        return undefined;

    else return Number(no_dollars);
}

if (Meteor.isClient) {
    setFootnote = function(text, random_index) {
        Session.set('footnote_text', text);
        Session.set('footnote_index', random_index)
        Meteor.setTimeout((function() {
            if (Session.get('footnote_index') == random_index) {
                Session.set('footnote_text', undefined);
                Session.set('footnote_index', undefined)
            }
        }), 5000)
    };

    Template.registerHelper('getRatingColor', function(value) {
        return 255 - Math.floor(value * 255);
    });
}

commaSeparatedValuesToArray = function(to_convert) {
    var string_array = [];
    var initial_array = to_convert.split(",").forEach(function(element) {
        var chopped = element;
        while (chopped[0] == " ") {
            chopped = chopped.slice(1);
        }

        while (chopped[chopped.length - 1] == " ") {
            chopped = chopped.slice(0, chopped.length - 1);
        }

        if (chopped.length > 0)
            string_array.push(chopped);
    })

    return string_array;
}