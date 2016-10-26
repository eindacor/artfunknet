var max_painting_height_pixels = 350;
var painting_offset_from_floor_cm = 120; //in cm
var max_distance_to_floor_px = 120; //in px
var min_frame_width_cm = 3;
var max_frame_width_cm = 16;
var min_matte_width_cm = 0;
var max_matte_width_cm = 20;
var texture_size_cm = 300;

var getMVPData = function() {
    var admin_id = Meteor.users.findOne({'profile.user_type': "admin"})._id;
    var all_items = items.find({'owner': {$nin : [admin_id, "Artfunkel, Inc."]}, 'status': {$nin: ['unclaimed', 'for_sale', 'claimed']}}).fetch();
    all_items.sort(function(first, second) {
        return getItemObjectValue(second, 'actual', undefined) - getItemObjectValue(first, 'actual', undefined);
    });

    all_items = all_items.slice(0, 20);

    var mvp_array = [];
    for (var i=0; i<all_items.length; i++) {
        var leaderboard_object =  {
            'item_id': all_items[i]._id,
            'artist': all_items[i].artwork_data.artist,
            'title': all_items[i].artwork_data.title,
            'owner': Meteor.users.findOne(all_items[i].owner).profile.screen_name,
            'value': getItemValue(all_items[i]._id, 'actual', all_items[i].owner),
            'rarity': all_items[i].artwork_data.rarity,
            'condition': all_items[i].condition,
            'foil': all_items[i].foil,
            'lottery': all_items[i].lottery,
            'seasonal': all_items[i].seasonal,
            'original': all_items[i].original
        }

        mvp_array.push(leaderboard_object);
    };

    return mvp_array;    
}

Meteor.methods({
    'getLeaderboardData' : function() {
        return {
            'mvp_data': getMVPData(),
            'gallery_score_data': galleries.find({}, {limit: 20, sort: {'score': -1}}).fetch(),
            'gallery_value_data': galleries.find({}, {limit: 20, sort: {'value': -1}}).fetch()
        }
    },

    'getInventory' : function() {
        var owned = items.find({'owner': Meteor.userId(), 'status': 'claimed'});
        var owned_array = [];

        owned.forEach(function(item_object) {
            owned_array.push(item_object._id);
        });

        return owned_array;
    },

    'getAuctions' : function(sorter, ascending) {
        var asc = (ascending ? 1 : -1);

        var sort_query = {};
        sort_query[sorter] = asc;

        var auction_objects = auctions.find({}, {fields : {'_id': 1}}, {sort: sort_query}).fetch();
        var auction_array = [];

        for (var i=0; i < auction_objects.length; i++) {
            auction_array.push(auction_objects[i]._id);
        };

        return auction_array;
    },

    'getUserGallery' : function(screen_name) {
        try {
            var user_object = Meteor.users.findOne({'profile.screen_name' : screen_name});
            var floor_finish_id = user_object.profile.gallery_finishes.active.floor_finish;
            var wall_finish_id = user_object.profile.gallery_finishes.active.wall_finish;

            var displayed = items.find({'owner': user_object._id, 'status': 'displayed'}).fetch();
            var permanent = items.find({'owner': user_object._id, 'status': 'permanent'}).fetch();

            var all_items = items.find({'owner': user_object._id, 'status': {$in: ['permanent', 'displayed']}}).fetch();
            var tallest_painting_cm = 0;
            for (var i=0; i < all_items.length; i++) {
                if (all_items[i].artwork_data.height > tallest_painting_cm)
                    tallest_painting_cm = all_items[i].artwork_data.height;
            }

            var pixels_per_centimeter = max_painting_height_pixels / tallest_painting_cm;
            
            var max_pixels_per_cm = max_distance_to_floor_px / painting_offset_from_floor_cm;

            pixels_per_centimeter = pixels_per_centimeter > max_pixels_per_cm ? max_pixels_per_cm : pixels_per_centimeter;

            var frame_width_range = max_frame_width_cm - min_frame_width_cm;
            var frame_width = Math.floor((min_frame_width_cm + (user_object.profile.gallery_finishes.frame_width * frame_width_range)) * pixels_per_centimeter);

            var matte_width_range = max_matte_width_cm - min_matte_width_cm;
            var matte_width = Math.floor((min_matte_width_cm + (user_object.profile.gallery_finishes.matte_width * matte_width_range)) * pixels_per_centimeter);

            if (user_object) {
                return {
                    'displayed': displayed,
                    'permanent': permanent,
                    'finish_data': {
                        'floor_filename': user_object.profile.gallery_finishes.owned.floor_finishes[floor_finish_id].filename,
                        'floor_size': Math.floor(texture_size_cm * pixels_per_centimeter) + "px " + Math.floor(texture_size_cm * pixels_per_centimeter * .5) + "px",
                        'wall_filename': user_object.profile.gallery_finishes.owned.wall_finishes[wall_finish_id].filename,
                        'wall_size': Math.floor(texture_size_cm * pixels_per_centimeter) + "px " + Math.floor(texture_size_cm * pixels_per_centimeter) + "px",
                        'wall_wash_opacity': (1 - user_object.profile.gallery_finishes.wall_opacity).toFixed(1),
                        'frame_width': frame_width,
                        'matte_width': matte_width,
                        'frame_color': user_object.profile.gallery_finishes.frame_color,
                        'displayed_shown': displayed.length > 0,
                        'permanent_shown': permanent.length > 0,
                        'offset_from_floor': painting_offset_from_floor_cm * pixels_per_centimeter,
                        'pixels_per_centimeter': pixels_per_centimeter,
                        'wall_base': user_object.profile.gallery_finishes.wall_base
                    }             
                }
            }

            else return {}
        }

        catch(error) {
            console.log(error);
            return {}
        }
    },

    'getUserScreenName' : function(user_id) {
        var user_object = Meteor.users.findOne(user_id);
        return user_object ? user_object.profile.screen_name : undefined;
    },

    'testCrateRolls' : function() {
        var roll_map = {
            'bronze' : 0,
            'silver' : 0,
            'gold' : 0,
            'platinum' : 0,
            'diamond' : 0
        }

        for (var i=0; i < 1000; i++) {
            var rolled = getRolledCrateQuality();
            roll_map[rolled] += 1;
        }
    },

    'getCollectionValue' : function(user_id) {
        var collection_total = 0;
        items.find({'owner' : user_id, 'status' : {$ne: 'unclaimed'}}).forEach(function(db_object) {
            collection_total += getItemValue(db_object._id, 'actual', user_id);
        });

        return collection_total;
    },

    'getExhibitionValue' : function(user_id) {
        var display_total = 0;
        var item_objects = items.find({'owner' : user_id, 'status' : 'displayed'});
        item_objects.forEach(function(db_object) {
            display_total += getItemValue(db_object._id, 'actual', user_id);
        });

        return display_total;
    },


    'getDisplayDetails' : function(item_id, duration) {
        return getDisplayDetails(item_id, duration);
    },

    'lookupCrateCost' : function(quality) {
        return lookupCrateCost(quality, admin_settings.crate_drop_count);
    },

    'resetRollCounts' : function() {
        items.update({}, {$set : {'roll_count' : 0}}, {multi : true});
        auctions.update({}, {$set : {'roll_count' : 0}}, {multi : true});
    },

    'getXPData' : function(current_level) {
        return {
            'chunk' : getXPChunk(current_level),
            'goal' : getXPGoal(current_level)
        }
    },

    'getEntryFees' : function() {
        return getEntryFees(Meteor.user());
    },

    'canTurnInQuest': function(quest_id) {
        return canTurnInQuest(quest_id);
    },

    'hasCompletedQuest': function() {
        var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();
        for (var i=0; i<all_quests.length; i++) {
            if (canTurnInQuest(all_quests[i]._id))
                return true;
        }

        return false;
    }
})

var refundHighestBid = function(auction_id) {
    var auction_object = auctions.findOne({'_id': auction_id});
    var bid_history = auction_object.bid_history;

    if (bid_history.length > 0) {
        var highest_bid = {'amount' : 0}

        for (var n=0; n < bid_history.length; n++) {
            if (bid_history[n].amount > highest_bid.amount)
                highest_bid = bid_history[n];
        }

        if (highest_bid.user_id != "auction_bot")
            addFunds(undefined, highest_bid.user_id, highest_bid.amount);
    }
}

var getHighestBidder = function(auction_id) {
    var auction_object = auctions.findOne({'_id': auction_id});
    var bid_history = auction_object.bid_history;

    if (bid_history.length > 0) {
        var highest_bid = {'amount' : 0}

        for (var n=0; n < bid_history.length; n++) {
            if (bid_history[n].amount > highest_bid.amount)
                highest_bid = bid_history[n];
        }

        return highest_bid.user_id;
    }

    else return undefined;
}
