crate_qualities = ["bronze", "silver", "gold", "platinum", "diamond"];
artwork_rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];

procUniqueAttribute = function(user_id, unique_code, required_npc_name, suppress_notification) {
    try {
        if (required_npc_name && npcs.findOne({'owner_id': user_id, 'attribute_id': attributes.findOne({'npc_name': required_npc_name})._id}) == undefined)
            return false;
            
        if (user_id == undefined)
            return false;

        //TODO replace logic with DB tracking of artworks or items with unique attributes
        var unique_attribute_object = unique_attributes.findOne({'code': unique_code, 'active': true});
        if (unique_attribute_object == undefined)
            return false;

        item_object = items.findOne({'owner': user_id, 'status': "displayed", 'active_unique_attribute': unique_code});

        if (item_object) {
            var new_code = Meteor.users.findOne({'_id': user_id, 'profile.notifications.procs.code': unique_code}) == undefined;
            var animations_enabled = Meteor.users.findOne(user_id).profile.settings.animations_enabled;

            // if (new_code && animations_enabled && suppress_notification != true) {
            //      Meteor.users.update(
            //          user_id, 
            //          {
            //              $push: {
            //                  'profile.notifications.procs': {
            //                      'id': new Meteor.Collection.ObjectID()._str,
            //                      'expiration': moment().add(5, "seconds")._d.toISOString(), 
            //                      'artist': item_object.artwork_data.artist, 
            //                      'title': item_object.artwork_data.title, 
            //                     'code': unique_code
            //                  }
            //              }
            //          }
            //      );
            //  }

            return item_object;
        }

        else return false;
    }

    catch (error) {
        console.log("could not proc " + unique_code + ": " + error.message);
        return false;
    }
}

getItemObjectValueByType = function(item_object, type, user_id) {
    try {
        if (item_object) {
            var base_value = item_object.values[type];

            if (type == "dealer" && procUniqueAttribute(user_id, "DEALER_DISCOUNT", undefined, true)) {
                base_value *= .75;
            }

            if (type == "sell") {
                if (quests.findOne({'owner_id': user_id, 'target': {$in: [item_object.artwork_id]}}) &&
                    procUniqueAttribute(user_id, "QUEST_ITEM_SELL_BONUS", undefined, true)) {
                    base_value *= 1.5;
                }

                if (item_object.status == "unclaimed" && 
                    procUniqueAttribute(user_id, "UNCLAIMED_ITEM_SELL_BONUS", undefined, true)) {
                    base_value *= 1.5;
                }
            }

            return Math.floor(base_value);
        }

        else {
            // console.log("undefined object...");
            // console.log("item_object: " + item_object);
            // console.log("type: " + type);
            return undefined;
        }
    }

    catch (error) {
        console.log("getItemObjectValueByType: " + error.message);
        console.log(item_object);
    }
}

// var combinationAlreadyExists = function(new_combination, combinations) {
//     for (var i=0; i<combinations.length; i++) {
//         var combination_to_compare = combinations[i];

//         var new_combination_map = {};
//         for (var n=0; n<new_combination.length; n++) {
//             var value = new_combination[n];
//             new_combination_map[value] == undefined ? new_combination_map[value] = 1 : new_combination_map[value] += 1;
//         }

//         var compare_combination_map = {};
//         for (var n=0; n<combination_to_compare.length; n++) {
//             var value = combination_to_compare[n];
//             compare_combination_map[value] == undefined ? compare_combination_map[value] = 1 : compare_combination_map[value] += 1;
//         }

//         var match = true;
//         var combination_map_keys = Object.keys(new_combination_map);
        
//         for (var n=0; n<combination_map_keys.length && match == true; n++) {
//             var value = combination_map_keys[n];
//             match = new_combination_map[value] == compare_combination_map[value];
//         }

//         if (match)
//             return true;
//     }

//     return false;
// }

// var combination_is_valid = function(combination) {
//     return (combination[0] + combination[1] + combination[2] + combination[3] + combination[4]) == 40;
// }

// var combinations = [];
// for (var a=4; a<11; a++) {
//     for (var b=4; b<11; b++) {
//         for (var c=4; c<11; c++) {
//             for (var d=4; d<11; d++) {
//                 for (var e=4; e<11; e++) {
//                     var combination = [a, b, c, d, e];
//                     if (combination_is_valid(combination) && !combinationAlreadyExists(combination, combinations)) {
//                         combinations.push(combination);
//                         console.log(combination);
//                     }
//                 }
//             }
//         }
//     }
// }

// var getBaseCombinations = function() {
//     var base_combinations = [];
//     for (var i=1; i<6; i++) {
//         for (var n=1; n<6; n++) {
//             if (i != n && !combinationAlreadyExists([i, n], base_combinations))
//                 base_combinations.push([i, n]);
//         }
//     }

//     return base_combinations;
// }

// var getRollCombinations = function(base_combination) {
//     var roll_combinations = [];
//     for (var i=1; i<6; i++) {
//         if (base_combination.indexOf(i) == -1) {
//             for (var n=1; n<6; n++) {
//                 if (base_combination.indexOf(n) == -1) {
//                     if (i != n && !combinationAlreadyExists([i, n], roll_combinations)) {
//                         roll_combinations.push([i, n]);
//                     }
//                 }
//             }
//         }
//     }

//     return roll_combinations;
// }

// var getVariants = function(base_combinations) {
//     var variants = [];
//     for (var i=0; i<base_combinations.length; i++) {
//         variants.push({
//             'base': base_combinations[i],
//             'roll combinations': getRollCombinations(base_combinations[i])
//         });
//     }

//     return variants;
// }

// var getUniquePermutations = function(variants) {
    
// }

// console.log(getVariants(getBaseCombinations()));
