var max_painting_height_pixels = 350;
var painting_offset_from_floor_cm = 120; //in cm
var max_distance_to_floor_px = 120; //in px
var min_frame_width_cm = 3;
var max_frame_width_cm = 16;
var min_matte_width_cm = 0;
var max_matte_width_cm = 20;
var texture_size_cm = 300;

var getMVPData = function(archive_status) {
    var admin_ids = ['Artfunkel, Inc.'];
    var botter_ids = ["A5W6WmH9ZvPRBQ6ZR", "ktByWpesBidgHoqum"];
    Meteor.users.find({'profile.user_type': "admin"}).forEach(function(user_object) {
        admin_ids.push(user_object._id);
    });

    var query_object;

    if (archive_status) {
        query_object = {
            'owner': {$nin: admin_ids}, 
            'displaced': false,
            'status': "archived",
            'authenticity.forgery': false
        };
    }

    else {
        query_object = {
            'owner': {$nin: admin_ids}, 
            'authenticity.forgery': false,
            $or: [{'status': "displayed"}, {'permanent': true}]
        };
    }

    var leaderboard_items = items.find(query_object, {limit: 20, sort: {'values.actual': -1}}).fetch();

    return leaderboard_items; 
}

var sortArchives = function(a, b) {
    if (a.total_value < b.total_value)
        return 1;
    if (a.total_value > b.total_value)
        return -1;
    return 0;
}

Meteor.methods({
    'getNow': function() {
        return getNowISOString();
    },

    'getLeaderboardData' : function() {
        var bot_ids = [];
        Meteor.users.find({'profile.user_type': "bot"}).forEach(function(user_object) {
            bot_ids.push(user_object._id);
        })

        return {
            'mvp_data': getMVPData(false),
            'archived_mvp_data': getMVPData(true),
            'gallery_score_data': galleries.find({'owner_id': {$nin: bot_ids}}, {limit: 20, sort: {'score': -1}}).fetch(),
            'gallery_value_data': galleries.find({'owner_id': {$nin: bot_ids}}, {limit: 20, sort: {'value': -1}}).fetch(),
            'gallery_earnings_data': galleries.find({'owner_id': {$nin: bot_ids}}, {limit: 20, sort: {'earnings_per_hour': -1}}).fetch(),
            'quests_completed_data': Meteor.users.find({'profile.user_type': {$nin:["admin", "bot"]}}, {limit: 20, sort: {'profile.completed_quests': -1}, fields: {'profile.completed_quests': 1, 'profile.screen_name': 1}}).fetch(),
            'money_spent_crates_data': Meteor.users.find({'profile.user_type': {$nin: ["admin", "bot"]}}, {limit: 20, sort: {'profile.money_spent_on_crates': -1}}).fetch(),
            'archive_data': metadata.findOne({'archive_data': {$ne: null}}).archive_data
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

    'getUserGallery' : function(screen_name) {
        try {
            var user_object = Meteor.users.findOne({'profile.screen_name' : screen_name});
            var floor_finish_id = user_object.profile.gallery_finishes.active.floor_finish;
            var wall_finish_id = user_object.profile.gallery_finishes.active.wall_finish;

            var all_items = items.find({'owner': user_object._id, $or: [{'permanent': true, 'displaced': {$ne: true}}, {'status': 'displayed'}]}).fetch();

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
                    'displayed': all_items,
                    'finish_data': {
                        'floor_filename': gallery_finishes.findOne(floor_finish_id).filename,
                        'floor_size': Math.floor(texture_size_cm * pixels_per_centimeter) + "px " + Math.floor(texture_size_cm * pixels_per_centimeter * .5) + "px",
                        'wall_filename': gallery_finishes.findOne(wall_finish_id).filename,
                        'wall_size': Math.floor(texture_size_cm * pixels_per_centimeter) + "px " + Math.floor(texture_size_cm * pixels_per_centimeter) + "px",
                        'wall_wash_opacity': (1 - user_object.profile.gallery_finishes.wall_opacity).toFixed(1),
                        'frame_width': frame_width,
                        'matte_width': matte_width,
                        'frame_color': user_object.profile.gallery_finishes.frame_color,
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
        items.find({'owner' : Meteor.userId(), 'status' : {$in: ["claimed", "displayed", "repairing"]}}).forEach(function(item_object) {
            collection_total += getItemObjectValueByType(item_object, 'actual', Meteor.userId());
        });

        return collection_total;
    },

    'getExhibitionValue' : function(user_id) {
        var display_total = 0;
        items.find({'owner' : user_id, 'status' : "displayed"}).forEach(function(item_object) {
            display_total += getItemObjectValueByType(item_object, 'actual', Meteor.userId());
        });

        return display_total;
    },

    'getXPData' : function(current_level) {
        return {
            'chunk' : getXPChunk(current_level),
            'goal' : getXPGoal(current_level)
        }
    },

    'getEntryFee' : function(gallery_owner_id) {
        var player_interface = new PlayerIF(gallery_owner_id);
        return player_interface.getEntryFee();
    },

    'canTurnInQuest': function(quest_id) {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.canTurnInQuest(quest_id);
    },

    'hasCompletedQuest': function() {
        var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();
        var player_interface = new PlayerIF(Meteor.user());
        for (var i=0; i<all_quests.length; i++) {
            if (player_interface.canTurnInQuest(all_quests[i]._id))
                return true;
        }

        return false;
    },

    'getCurrentTime': function() {
        return moment()._d.toISOString();
    }
})
