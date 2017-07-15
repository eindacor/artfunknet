PlayerIF = function(user) {
	var user_id;
	var user_object;
    var made_from_object = (typeof user !== "string");

    try {
        user_object = made_from_object ? user : getOneFromCollection("PlayerIF.js:ItemIF - " + user, Meteor.users, {'_id': user});
        user_id = user_object._id;
    }

    catch(error) {
        throw "invalid user: " + user;
    }

	if (user_object == undefined) {
		throw "invalid user: " + user_id;
	}

	this.wasMadeFromObject = function() {
		return made_from_object;
	}

	this.getId = function() {
		return user_id;
	}

	this.isAdmin = function() {
		return user_object.profile.user_type == "admin";
	}

	this.isActive = function() {
		return user_object.profile.active;
	}

	this.getBankBalance = function() {
		return user_object.profile.bank_balance;
	}

	this.getPlayerLevel = function() {
		return user_object.profile.level;
	}

	this.getUserObject = function() {
		return user_object;
	}

	this.isRecentlyActive = function() {
		var recent_cutoff = ONE_DAY * 30;
		var last_npc_met = user_object.profile.last_npc_met;
		var now = moment()._d.toISOString();
		if (last_npc_met == undefined) {
			Meteor.users.update(user_id, {$set: {'profile.last_npc_met': now}})
			return true;
		}

		var time_passed = moment(now) - moment(last_npc_met);
		return time_passed < recent_cutoff;
	}

	this.getKnowledge = function() {
		return user_object.profile.knowledge;
	}

	this.giveKnowledge = function(knowledge_object) {
		var keys = Object.keys(knowledge_object);
		var inc_object = {};
		for (var i=0; i<keys.length; i++) {
			var amount = knowledge_object[keys[i]];
			var inc_string = 'profile.knowledge.' + keys[i];
			inc_object[inc_string] = amount;
		}
		Meteor.users.update({'_id': user_id}, {$inc: inc_object});
	}

	this.getQuickDiscardableItemIds = function() {
	    var item_ids = [];

	    var all_to_donate = getFromCollection("PlayerIF.js", items, {'owner': user_id, 'status': {$in: ["unclaimed", "won"]}}).fetch();
	    for (var i=0; i<all_to_donate.length; i++) {
	    	var item_object = all_to_donate[i];
	    	var permissions = new PlayerItemPermissions(this, new ItemIF(item_object));
	        if (permissions.canQuickDiscard()) {
	            item_ids.push(item_object._id);
	        }
	    }

	    return item_ids;
	}

	this.getQuickDiscardableItemInterfaces = function(to_archive) {
		var item_interfaces = [];

	    var all_discardable = getFromCollection("PlayerIF.js", items, {'owner': user_id, 'status': {$in: ["unclaimed", "won"]}}).fetch();
	    for (var i=0; i<all_discardable.length; i++) {
	    	var item_interface = new ItemIF(all_discardable[i]);
	    	var permissions = new PlayerItemPermissions(this, item_interface);
	        if (permissions.canQuickDiscard(to_archive)) {
	            item_interfaces.push(item_interface);
	        }
	    }

	    return item_interfaces;
	}

	this.canTurnInQuest = function(quest_id) {
		var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.canTurnInQuest()", quests, quest_id);
		if (quest_object == undefined || quest_object.target == undefined || quest_object.target.length == 0)
			return false;

		if (quest_object.owner_id != user_id)
			return false;

		var targets_found = 0;
		for (var i=0; i<quest_object.target.length; i++) {
			if (getOneFromCollection("PlayerIF.js", items, {'artwork_id': quest_object.target[i], 'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}}) != undefined)
				targets_found++;
		}

		return targets_found >= quest_object.min_requirement;
	}

	this.turnInQuest = function(quest_id, sell, donate) {
		try {
			if (sell && donate)
				return false;

			if (this.canTurnInQuest(quest_id)) {
	            var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", quests, quest_id);

	            var base_xp = quest_object.reward.xp;
	            var xp_recieved = base_xp;
	            var unique_targets_found = [];
	            var unique_specials_found = [];

	            var give_knowledge = this.procUniqueAttribute("KNOWLEDGE_FOR_QUESTS", undefined);

	            var non_forgery_target_array = [];
	            var forgery_target_array = [];

	            //if the id only exists in the forgery target array, check the item
	            var forgery_found = false;

	            getFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", items, {'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 'artwork_id': {$in: quest_object.target}}).forEach(function(item_object) {
	                if (non_forgery_target_array.indexOf(item_object.artwork_id) == -1 && !item_object.authenticity.forgery) {
	                    non_forgery_target_array.push(item_object.artwork_id);
	                }

	                else if (forgery_target_array.indexOf(item_object.artwork_id) == -1 && item_object.authenticity.forgery) {
	                	forgery_target_array.push(item_object.artwork_id);
	                }
	            });

	            var player_interface = this;

	            getFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", items, {'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, $and: [{'artwork_id': {$in: forgery_target_array}}, {'artwork_id': {$nin: non_forgery_target_array}}], 'authenticity.forgery': true}).forEach(function(item_object) {
	                var nested_item_interface = new ItemIF(item_object);
	                var nested_player_item_interface = new PlayerItemIF(player_interface, nested_item_interface);
	                nested_player_item_interface.makeLiable();

	                if (nested_player_item_interface.catchForgery(FORGERY_HEAT_CATEGORY.QUEST)) {
	                	nested_item_interface.punishForgeryOwner(player_interface);
	                	forgery_found = true;
	                }
	            });

	            getFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", items, {'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 'artwork_id': {$in: quest_object.target}, 'authenticity.forgery': false}).forEach(function(item_object) {
	                var nested_item_interface = new ItemIF(item_object);
	                var nested_player_item_interface = new PlayerItemIF(player_interface, nested_item_interface);
	                nested_player_item_interface.makeLiable();

	                if (forgery_found) {
	                	return;
	                }

	                if (unique_targets_found.indexOf(item_object.artwork_id) == -1) {
	                    unique_targets_found.push(item_object.artwork_id);
	                    if (give_knowledge) {
	                        var item_interface = new ItemIF(item_object);
	                        var knowledge_object = item_interface.getDonationReward();  
	                        var nested_player_interface = new PlayerIF(item_object.owner);             
	                        nested_player_interface.giveKnowledge(knowledge_object);
	                    }
	                }

	                if (unique_specials_found.indexOf(item_object.artwork_id) == -1 && (item_object.foil || item_object.original || item_object.vintage))
	                    unique_specials_found.push(item_object.artwork_id);
	            });

				if (forgery_found) {
					quests.remove(quest_id);
					return;
				}

	            var target_differential = unique_targets_found.length - quest_object.min_requirement;
	            xp_recieved += Math.floor(base_xp * target_differential * 0.4);
	            var special_count = unique_specials_found.length;
	            xp_recieved += Math.floor(base_xp * special_count * 0.2);

	            this.addXP(xp_recieved, false);
	            logXPChunkPercentage("quest", quest_object.reward.xp_chunk_percentage + (special_count * 0.3) + (target_differential * 0.5));
	            this.addFunds("quest", quest_object.reward.money);

	            Meteor.users.update({'_id': user_id}, {$inc: {'profile.completed_quests': 1}});

	            if (quest_object.reward.item != undefined) {
	                var rarity = quest_object.reward.item.rarity;
	                var count = getFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", artworks, {'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}).count();
	                var random_index = Math.floor(Math.random() * count);
	                var random_artwork = getOneFromCollection("PlayerIF.js:PlayerIF.turnInQuest()", artworks, {'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}, {skip: random_index});

	                var item_generator = {
	                    'source': "quest",
	                    'artwork_interface': new ArtworkIF(random_artwork),
	                    'foil_chance': quest_object.reward.item.foil ? 1 : undefined,
	                    'status': "unclaimed"
	                }

	                ITEM_GENERATOR.generateSingle(item_generator, this);
	            }

	            if (this.procUniqueAttribute("QUEST_TARGET_CONDITION_INCREASE", undefined)) {
	                updateItemsBySelector({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 'artwork_id': {$in: quest_object.target}}, {$set: {'condition': .9}});
	            }

	            if (sell || donate) {
	            	//TODO replace with ItemIF array
		            var quest_targets = getFromCollection("PlayerIF.js", items, {'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 'artwork_id': {$in: quest_object.target}}).fetch();
		            for (var i=0; i<quest_targets.length; i++) {
		            	// check to verify item isn't part of multiple quests
		            	var artwork_id = quest_targets[i].artwork_id;
		            	if (getFromCollection("PlayerIF.js", quests, {'owner_id': user_id, 'target': {$in: [artwork_id]}}).count() > 1) {
		            		continue;
		            	}

		            	if (itemIsMisprinted(quest_targets[i])) {
		            		continue;
		            	}

		            	var player_item_interface = new PlayerItemIF(this, new ItemIF(quest_targets[i]));
		            	if (player_item_interface.getPlayerItemPermissions().canQuickDiscard()) {
			                if (sell) {
			                	player_item_interface.sell();
			                }

			                else if (donate) {
			                	player_item_interface.donate();
			                }
			            }
		            }
		        }

	            quests.remove(quest_id);
	        }
        }

        catch(error) {
        	console.log(error)
        }
	}

	this.cancelQuest = function(quest_id) {
		var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.cancelQuest()", quests, quest_id);
        if (quest_object && quest_object.owner_id == user_id)
            quests.remove(quest_id);
	}

	this.canBuyAllFavorites = function() {
		//only consider galleries with score > 0
		//can afford all tickets
		//all considered galleries < ticket cap

		//add counts for current tickets not in favorites
		var total_cost = 0;
		var gallery_query_object = {
			'_id': {$in: user_object.profile.favorite_galleries},
			'score': {$gt: 0}
		};

		var favorite_gallery_objects = getFromCollection("PlayerIF.js:PlayerIF.canBuyAllFavorites()", galleries, gallery_query_object).fetch();

		var current_non_favorite_ticket_count = 0;
		var current_favorite_ticket_count = 0;

		//TODO add gallery id to ticket db
		getFromCollection("PlayerIF.js:PlayerIF.canBuyAllFavorites()", gallery_tickets, {'ticketholder': user_id, 'expiration': {$gt: moment()._d.toISOString()}}).forEach(function(ticket_object) {
			var gallery_id = getOneFromCollection("PlayerIF.js", galleries, {'owner_id': ticket_object.gallery_owner})._id;
			if (user_object.profile.favorite_galleries.indexOf(gallery_id) == -1)
				current_non_favorite_ticket_count++;

			else current_favorite_ticket_count++;
		});

		if (favorite_gallery_objects.length + current_non_favorite_ticket_count > user_object.profile.ticket_cap)
			return false;

		if (current_favorite_ticket_count >= user_object.profile.favorite_galleries.length)
			return false;

		for (var i=0; i<favorite_gallery_objects.length; i++) {
			var gallery_owner_interface = new PlayerIF(favorite_gallery_objects[i].owner_id);
			total_cost += gallery_owner_interface.getEntryFee();
		}

		return user_object.profile.bank_balance >= total_cost;
	}

	this.buyAllFavorites = function() {
		if (this.canBuyAllFavorites()) {
			var gallery_query_object = {
				'_id': {$in: user_object.profile.favorite_galleries},
				'score': {$gt: 0}
			};

			var all_favorite_galleries = getFromCollection("PlayerIF.js:PlayerIF.buyAllFavorites()", galleries, gallery_query_object).fetch();
			for (var i=0; i<all_favorite_galleries.length; i++) {
				this.purchaseTicket(all_favorite_galleries[i]._id);
			}
		}
	}

	this.purchaseTicket = function(gallery_id) {
		if (!this.canPurchaseTicket())
			return false;

		var gallery_object = getOneFromCollection("PlayerIF.js:PlayerIF.purchaseTicket()", galleries, gallery_id);

		if (gallery_object == undefined)
			return false;

        var owner_id = gallery_object.owner_id;

        if (getOneFromCollection("PlayerIF.js:PlayerIF.purchaseTicket()", gallery_tickets, {"ticketholder": user_id, "gallery_owner":owner_id, 'expiration': {$gt : getNowISOString()}}) != undefined)
			return false;

        var ticket_duration = 30; // minutes
        var ticket_expiration = moment().add(ticket_duration, 'minutes')._d.toISOString();
        
        var entry_fee = gallery_object.entry_fee;

        var gallery_owner_interface = new PlayerIF(owner_id);
        var actual_amount = gallery_owner_interface.getEntryFee();

        if (actual_amount > user_object.profile.bank_balance || user_object._id === owner_id)
            return;

        var ticket_object = {
            'ticketholder': user_object._id,
            'gallery_owner': owner_id,
            'expiration': ticket_expiration
        };

        var new_id = gallery_tickets.insert(ticket_object);

        gallery_owner_interface.addFunds("ticket sale", actual_amount);
        this.chargeAccount(actual_amount);
	}

	this.canPurchaseTicket = function() {
		return getFromCollection("PlayerIF.js:PlayerIF.canPurchaseTicket()", gallery_tickets, {'ticketholder': user_id}).count() < user_object.profile.ticket_cap;
	}

	this.alert = function(message, icon, sentiment) {
        var alert_object = {
            'user_id' : user_id,
            'message' : message,
            'link' : '/',
            'icon' : icon,
            'sentiment' : sentiment,
            'time' : getNowISOString()
        };

        alerts.insert(alert_object);
	}

	this.addXP = function(xp, suppress_legendary) {
		if (!this.isActive())
			return;

		if (suppress_legendary !== true && this.procUniqueAttribute("MONEY_FOR_XP", undefined)) {
			try {
				this.addFunds("MONEY_FOR_XP", xp * 2);
			}

			catch(error) {
				console.log(error);
				console.log("xp: " + xp);
			}
		}

		var xp_to_add = xp;
		var user_object = Meteor.users.findOne(user_id);
		var player_level = user_object.profile.level;
		var player_xp = user_object.profile.xp;
		var level_up_count = 0;

		while (xp_to_add > 0) {
			var xp_goal = getXPGoal(player_level + level_up_count);
			var remaining_xp = xp_goal - player_xp;

			if (remaining_xp > xp_to_add) {
				player_xp += xp_to_add;
				xp_to_add = 0;
			}

			else {
				level_up_count++;
				player_xp = 0;
				xp_to_add -= remaining_xp;
			}
		}

		if (level_up_count > 0)
			this.levelUp(level_up_count);

		Meteor.users.update(user_id, {$set: {'profile.xp' : player_xp}});
	}

	this.addXPChunkPercentage = function(source, chunk_percentage, suppress_legendary) {
		var chunk = getXPChunk(this.getPlayerLevel());
		logXPChunkPercentage(source, chunk_percentage);
		this.addXP(Math.floor(chunk * chunk_percentage), suppress_legendary);
	}

	this.levelUp = function(level_count) {
		try {
			var current_level = this.getPlayerLevel();
			var level_hit = current_level;
			if (current_level < PLAYER_LEVEL_MAX) {
				level_hit++;

				var level_message = "You have reached level " + level_hit + "!";
				this.alert(level_message, 'fa-star', 'good');

				var cap_object_before= getCapSetterObject(current_level);
				var cap_object_after = getCapSetterObject(level_hit);

				var setter = {'profile.level': level_hit};

				var cap_keys = Object.keys(cap_object_after);
				for (var i=0; i < cap_keys.length; i++) {
					var key = cap_keys[i];
					var before_value = cap_object_before[key];
					var after_value = cap_object_after[key];

					var setter_key = "profile." + key;
					setter[setter_key] = after_value;

					if (before_value < after_value) {
						var message;

						switch(key) {
							case 'repairing_cap' : message = "Your item repair limit has increased to " + after_value + "."; break;
							case 'inventory_cap' : message = "Your inventory capacity has increased to " + after_value + "."; break;
					        case 'display_cap' : message = "Your display capacity has increased to " + after_value + "."; break;
					        case 'auction_cap' : message = "Your auction limit has increased to " + after_value + "."; break;
					        case 'ticket_cap' : message = "Your ticket limit has increased to " + after_value + "."; break;
					        case 'pc_cap' : message = "Your permanent collection capacity has increased to " + after_value + "."; break;
					        case 'visitor_cap' : message = "Your gallery's visitor capacity has increased to " + after_value + "."; break;
					        case 'forgery_contract_cap': message = "Your forgery contract limit has increased to " + after_value + "."; break;
					        default: message = ""; break;
						}

						this.alert(message, 'fa-star', 'good');
					}
				}

				Meteor.users.update(user_id, {$set : setter});
			}

			else {
				Meteor.users.update(user_id, {$inc: {'profile.lottery_tickets': level_count}});
			}
		}

		catch(error) {
			console.log(error.message);
		}
	}

	this.addFunds = function(source, amount) {
		if (!this.isActive())
			return;

		if (isNaN(amount)) {
	        throw "invalid amount in PlayerIF.addFunds(), amount: " + amount + ", user_id: " + user_id + ", source: " + source;
	    }

	    var actual_amount = Math.floor(amount);

	    logMoneyMade(source, actual_amount);

	    var current_balance = this.getBankBalance();
	    Meteor.users.update(user_id, {$inc: {"profile.bank_balance" : actual_amount}});
	    // if (getOneFromCollection("PlayerIF.js", Meteor.users, user_id).profile.settings.animations_enabled) {
	    //     Meteor.users.update(user_id, {$push: {'profile.notifications.money': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': amount}}});
	    // }
	}

	this.chargeAccount = function(amount) {
		if (isNaN(amount))
	        throw "invalid amount";

	    return Meteor.users.update({'_id': user_id, 'profile.bank_balance': {$gte: Math.floor(amount)}}, {$inc: {"profile.bank_balance" : -1 * Math.floor(amount)}});
	}

	var getProcMap = function(attribute_totals, gallery_rarity_npc_coefficient, player_level_coefficient, proc_boost) {
		var procs = {};
		var display_cap = user_object.profile.display_cap;
	    var attribute_ids = Object.keys(attribute_totals);

		for (var i=0; i < attribute_ids.length; i++) {
	        var attribute_id = attribute_ids[i];
	        var attribute_rating = attribute_totals[attribute_id] / display_cap;

	        var base_proc = attribute_rating * gallery_rarity_npc_coefficient * player_level_coefficient;

	        var squared_proc = Math.pow(base_proc, 2);
	        squared_proc *= BASE_NPC_PROC_MAX;

	        if (proc_boost) {
	            var proc_boost_value = user_object.profile.marketing_manager_spawn_boost_coefficient * MARKETING_PROC_BOOST;
	            squared_proc += proc_boost_value;
	        }

	        procs[attribute_id] = Number(squared_proc.toFixed(2));
	    }

	    return procs;
	}

	this.updateGalleryDetails = function(callback) {
		if (user_id == BOT_USER_NAME) {
			return;
		}

		var gallery_value = 0;
	    var earnings_per_hour = 0;
	    var xp_per_hour = 0;
	    var attribute_rating_total = 0;
	    var rarity_npc_coefficient_total = 0;
	    var active_unique_attributes = [];
	    var attribute_totals = {};
	    var published_attribute_totals = {};

	    var now = moment()._d.toISOString();
	    var all_displayed = getFromCollection("PlayerIF.js:PlayerIF.updateGalleryDetails()", items, {'owner' : user_id, 'status' : "displayed"}).fetch();
	    var display_count = all_displayed.length;

	    for (var i=0; i<all_displayed.length; i++) {
	    	var item_object = all_displayed[i];
	    	var player_item_interface = new PlayerItemIF(this, new ItemIF(item_object));

            gallery_value += player_item_interface.getValue('actual');
            earnings_per_hour += player_item_interface.getDisplayValuePerHour(now);
            xp_per_hour += player_item_interface.getXPPerHour(now);
            var item_attributes = getAllItemObjectAttributes(item_object);

            var rarity_npc_coefficient;

            switch(item_object.artwork_data.rarity) {
                case "common": rarity_npc_coefficient = .84; break;
                case "uncommon": rarity_npc_coefficient = .88; break;
                case "rare": rarity_npc_coefficient = .92; break;
                case "legendary": rarity_npc_coefficient = .96; break;
                case "masterpiece": rarity_npc_coefficient = 1; break;
                default: rarity_npc_coefficient = .5; break;
            }

            rarity_npc_coefficient_total += rarity_npc_coefficient;
            var forgery_spawn_reduction_coefficient = .5 * item_object.authenticity.forgery_quality;
            var spawn_penalty_reduction_coefficient = user_object.profile.spawn_reduction_coefficient;

            for (var n=0; n < item_attributes.length; n++) {
                var attribute_id = item_attributes[n]._id;
                var attribute_value = item_attributes[n].value * spawn_penalty_reduction_coefficient;
                attribute_rating_total += item_attributes[n].value

                if (attribute_totals[attribute_id] === undefined) {
                	if (!item_object.authenticity.forgery) {
                		attribute_totals[attribute_id] = attribute_value;
                	}

                	else {
                		attribute_totals[attribute_id] = attribute_value * forgery_spawn_reduction_coefficient;
                	}
                    
                    published_attribute_totals[attribute_id] = attribute_value;
                }

                else {
                	if (!item_object.authenticity.forgery) {
                		attribute_totals[attribute_id] += attribute_value;
                	}

                	else {
                		attribute_totals[attribute_id] += (attribute_value * forgery_spawn_reduction_coefficient);
                	}

                	published_attribute_totals[attribute_id] += attribute_value;
                }


            }

	        if (all_displayed[i].active_unique_attribute) {
	        	active_unique_attributes.push(all_displayed[i].active_unique_attribute);
	        }
	    }

	    var gallery_score = Math.floor(attribute_rating_total * 100);
	    var gallery_rarity_npc_coefficient = display_count ? rarity_npc_coefficient_total / display_count : 0;

	    var player_level_coefficient_min = .9;
	    var player_level_coefficient_delta = 1 - player_level_coefficient_min;
	    var player_level_coefficient = player_level_coefficient_min + ((this.getPlayerLevel() / PLAYER_LEVEL_MAX) * player_level_coefficient_delta);

	    var proc_boost = user_object.profile.marketing_manager_spawn_boost_expiration != undefined && user_object.profile.marketing_manager_spawn_boost_expiration > moment()._d.toISOString();

	    var procs = getProcMap(attribute_totals, gallery_rarity_npc_coefficient, player_level_coefficient, proc_boost);
	    var published_procs = getProcMap(published_attribute_totals, gallery_rarity_npc_coefficient, player_level_coefficient, proc_boost);

	    if (getOneFromCollection("PlayerIF.js:PlayerIF.updateGalleryDetails()", galleries, {"owner_id" : user_id}) == undefined) {
	        galleries.insert({
	            'owner_id' : user_id,
	            'owner' : user_object.profile.screen_name,
	            'procs': procs,
	            'published_procs': published_procs,
	            'entry_fee' : user_object.profile.entry_fee,
	            'score': gallery_score,
	            'value': gallery_value,
	            'gallery_rarity_npc_coefficient': gallery_rarity_npc_coefficient,
	            'earnings_per_hour': earnings_per_hour,
	            'xp_per_hour': xp_per_hour,
	            'active_unique_attributes': active_unique_attributes
	        });
	    }

	    else galleries.update({'owner_id' : user_id}, 
	        {$set: {
	            'procs': procs,
	            'published_procs': published_procs,
	            'score': gallery_score, 
	            'value': gallery_value,
	            'gallery_rarity_npc_coefficient': gallery_rarity_npc_coefficient,
	            'earnings_per_hour': earnings_per_hour,
	            'xp_per_hour': xp_per_hour,
	            'active_unique_attributes': active_unique_attributes
	        }
	    });

	    if (callback) {
	    	callback();
	    }
	}

	this.getExpansionSlotCost = function() {
        var cost = Math.floor(1000000 * Math.pow(1.2, user_object.profile.expansion_slots));
        return cost;
	}

	this.purchaseExpansionSlot = function() {
        var cost = this.getExpansionSlotCost();
        if (user_object.profile.bank_balance >= cost) {
            this.chargeAccount(cost);
            Meteor.users.update(user_object._id, {$inc: {'profile.expansion_slots': 1}});
        }

	    else return false;
	}

	this.declineAllForSale = function() {
		var all_for_sale = getFromCollection("PlayerIF.js:PlayerIF.declineAllForSale()", items, {
	        'owner': user_id,
	        'status': "for_sale", 
	    }).fetch();

		for (var i=0; i<all_for_sale.length; i++) {
			var player_item_interface = new PlayerItemIF(this, new ItemIF(all_for_sale[i]));
	        player_item_interface.quickDecline();
		}
	}

	//TODO use getQuickDiscardableInterfaces()
	this.getSellAllData = function() {
	    var total_value = 0;
	    var item_ids = [];

	    var all_unclaimed = getFromCollection("PlayerIF.js:PlayerIF.getSellAllData()", items, {
	        'owner': user_id,
	        'status': {$in: ["unclaimed", "won"]}, 
	    }).fetch();

	    //TODO add legendary procs for sell amounts here
	    for (var i=0; i<all_unclaimed.length; i++) {
	    	var item_interface = new ItemIF(all_unclaimed[i]);
	    	var permissions = new PlayerItemPermissions(this, item_interface);
	        if (permissions.canQuickDiscard()) {
	            total_value += getItemObjectValueByType(item_interface.getItemObject(), "sell", user_id);
	            item_ids.push(all_unclaimed[i]._id);
	        }
	    }

	    return {
	        'value': total_value,
	        'ids': item_ids
	    }
	}

	this.sellAllUnclaimed = function() {
		var sell_all_data = this.getSellAllData();

        getFromCollection("PlayerIF.js:PlayerIF.sellAllUnclaimed()", items, {'_id': {$in: sell_all_data.ids}}).forEach(function(item_object) {
            removeItem(item_object._id, "sell all", undefined);
        });

        this.addFunds("sell item", sell_all_data.value);
	}

	this.archiveAllUnclaimed = function() {
		var to_archive = true;
		var discardable_interfaces = this.getQuickDiscardableItemInterfaces(to_archive);

        for (var i=0; i<discardable_interfaces.length; i++) {
            var item_interface = discardable_interfaces[i];
            var player_item_interface = new PlayerItemIF(this, item_interface);
            var recommended_status = player_item_interface.getRecommendedStatus();
            if (recommended_status.displaced_item) {
            	if (!recommended_status.upgrade || !user_object.profile.settings.auto_archive_upgrades) {
            		continue;
            	}
            }

            player_item_interface.archive();
        }
	}

	this.deleteAllDisplaced = function() {
		items.remove({'owner': user_id, 'status': "archived", 'displaced': true});
	}

	this.donateAllUnclaimed = function() {
		var discardable_interfaces = this.getQuickDiscardableItemInterfaces();

        for (var i=0; i<discardable_interfaces.length; i++) {
            var item_interface = discardable_interfaces[i];
            var player_item_interface = new PlayerItemIF(this, item_interface);
            player_item_interface.donate();
        }
	}

	this.getMaxQuests = function(npc_object) {
	    return 8;
	}

	this.getActiveQuests = function() {
	    return getFromCollection("PlayerIF.js:PlayerIF.getActiveQuests()", quests, {'owner_id': user_id}).count();
	}

	this.canAcceptQuest = function(npc_object) {
	    return (this.getActiveQuests() < this.getMaxQuests(npc_object));
	}

	this.getEntryFee = function() {
        switch(user_object.profile.entry_fee) {
            case 'free': return 0;
            case 'low': return 5;
            case 'medium': return 50;
            case 'high': return 500;
            case 'outrageous': return 5000;
            default: return 0;
        }
	}

	this.resetTutorials = function() {
	    Meteor.users.update(user_id, {$set: {
	        'profile.tutorials': {
	            'welcome': true,
	            'loot': false,
	            'info': false,
	            'action_buttons': false,
	            'attributes': false,
	            'level': false,
	            'display': false,
	            'permanent': false,
	            'gallery': false,
	            'my_gallery': false,
	            'galleries': false,
	            'other_gallery': false,
	            'reroll_menu': false
	        }
	    }});
	}

	this.displayAllTagged = function(tag_array, duration) {
        var tagged_items = getFromCollection("PlayerIF.js:PlayerIF.displayAllTagged()", items, {'owner': user_id, 'tags': {$in: tag_array}, 'status': {$ne: "displayed"}}).fetch();
        var has_capacity = getFromCollection("PlayerIF.js:PlayerIF.displayAllTagged()", items, {'owner' : user_id, 'status' : "displayed"}).count() + tagged_items.length <= user_object.profile.display_cap;

        if (!has_capacity)
            return false;

        for (var i=0; i<tagged_items.length; i++) {
            var permissions = new PlayerItemPermissions(this, new ItemIF(tagged_items[i]));
            if (!permissions.canDisplay())
                return false;
        }

        for (var i=0; i<tagged_items.length; i++) {
            var player_item_interface = new PlayerItemIF(this, new ItemIF(tagged_items[i]));
            player_item_interface.setDisplayStatus(true);
        }

        return true;
	}

	this.getDisplayValues = function() {
		var value_total = 0;
        var earnings_per_hour = 0;
        var now = moment()._d.toISOString();

        var all_displayed = getFromCollection("PlayerIF.js:PlayerIF.getDisplayValues()", items, {'owner' : user_id, 'status' : "displayed"}).fetch();

        for (var i=0; i<all_displayed.length; i++) {
			var player_item_interface = new PlayerItemIF(this, new ItemIF(all_displayed[i]));
            value_total += player_item_interface.getValue('actual');
            earnings_per_hour += player_item_interface.getDisplayValuePerHour(now);
        }

        return {
            'value_total': value_total,
            'earnings_per_hour': earnings_per_hour
        };
	}

	this.getTotalXPPerHour = function() {
		var total_xp = 0;
        var now = moment()._d.toISOString();
        var all_xp_earners = getFromCollection("PlayerIF.js:PlayerIF.getTotalXPPerHour()", items, {'owner': user_id, 'status': "displayed"}).fetch();

        for (var i=0; i<all_xp_earners.length; i++) {
        	var player_item_interface = new PlayerItemIF(this, new ItemIF(all_xp_earners[i]));
            total_xp += player_item_interface.getXPPerHour(now);
        }

        return total_xp;
	}

	var unique_attribute_array;
	var visitors_present;

	this.procUniqueAttribute = function(unique_code, visitor_requirement) {
		try {
	        if (visitor_requirement) {
	        	if (visitors_present == undefined) {
	        		visitors_present = [];
	        		getFromCollection("PlayerIF.js:procUniqueAttribute", npcs, {'owner_id': user_id}).forEach(function(npc_object) {
	        			visitors_present.push(npc_object.npc_name);
	        		})
	        	}

	        	if (visitors_present.indexOf(visitor_requirement) == -1) {
	        		return false;
	        	}
	        }

	        var unique_id = getOneFromCollection("PlayerIF.js:procUniqueAttribute", unique_attributes, {'code': unique_code, 'active': true})._id;
	        //TODO instead return an array of item interfaces for future UX indicators
	        if (unique_attribute_array == undefined){
	        	unique_attribute_array = getOneFromCollection("PlayerIF.js:procUniqueAttribute", galleries, {'owner_id': user_id}).active_unique_attributes;
	        }

	        var proc = unique_attribute_array.indexOf(unique_id) != -1;

	        if (DEBUG && proc) {
	            console.log("proc: " + unique_code);
	        }

	        return proc;
	    }

	    catch (error) {
	        console.log("could not proc " + unique_code + ": " + error.message);
	        return false;
	    }
	}

	this.hasDisplacedItems = function() {
		return items.findOne({'owner': user_id, 'status': "archived", 'displaced': true}) != undefined;
	}

	this.hasArchivedArtworkOfCategory = function(artwork_interface, category) {
		var query_object = JSON.parse(JSON.stringify(CATEGORY_QUERIES[category]));
		query_object.owner = user_id;
		query_object.artwork_id = artwork_interface.getId();
		query_object.status = "archived";
		query_object.displaced = false;

		return getOneFromCollection("PlayerIF.js:hasArchivedArtworkOfCategory", items, query_object) != undefined;
	}

	this.inventoryIsFull = function() {
		return items.find({
			'owner' : user_id, 
			'status' : {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 
			'original': {$ne: true},
			'vintage': {$ne: true}
		}).count() >= user_object.profile.inventory_cap + user_object.profile.expansion_slots + (user_object.profile.vintage_count * 2);
	}

	this.getForgeryCost = function(forged_item_object, forgery_quality) {
		var values_object = getItemObjectValues(forged_item_object);
		var forgery_quality_value_coefficient = .4;
		var forgery_quality_value_inverse_coefficient = 1 - forgery_quality_value_coefficient;
		var cost_adjuster = (FORGERY_COST_COEFFICIENT * forgery_quality_value_inverse_coefficient) + (FORGERY_COST_COEFFICIENT * forgery_quality_value_coefficient * forgery_quality);
		return Math.floor(values_object.actual * cost_adjuster);
	}

	this.canForgeItem = function(forged_item_object, forgery_contract_object) {
		if (forgery_contract_object == undefined || forgery_contract_object.owner_id != user_id) {
			return false;
		}

		return user_object.profile.bank_balance >= this.getForgeryCost(forged_item_object, forgery_contract_object.quality);
	}

	this.forgeItem = function(forged_item_object, forgery_contract_id) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		if (this.canForgeItem(forged_item_object, forgery_contract_object)) {
			forged_item_object.owner = this.getId();
			this.chargeAccount(this.getForgeryCost(forged_item_object, forgery_contract_object.quality));
			ITEM_GENERATOR.createForgedItem(forged_item_object, forgery_contract_object, function() {
				forgery_contracts.remove({'_id': forgery_contract_id});
			});
		}
	}

	this.increaseVisitorSpawnPenalty = function() {
		var spawn_reduction_min = .2;
		var spawn_reduction = .1;
		var spawn_reduction_duration = ONE_DAY;

		Meteor.users.update(
			{
				'_id': user_id, 
				'profile.spawn_reduction_coefficient': {$gt: spawn_reduction_min}
			}, 
			{
				$inc: {'profile.spawn_reduction_coefficient': spawn_reduction * -1}, 
				$set: {'profile.spawn_reduction_end': moment().add(spawn_reduction_duration, 'milliseconds')._d.toISOString()}
			}, function() {
				var nested_player_interface = new PlayerIF(user_object);
				nested_player_interface.updateGalleryDetails();
			}
		);
	}

	this.giveForgeryContracts = function(count, npc_object) {
		var quality_index = VISITOR_QUALITIES.indexOf(npc_object.quality);
		var forgery_quality_min = .15 * (quality_index + 1);
		var forgery_quality = forgery_quality_min + (Math.random() * (1 - forgery_quality_min));

		var forgery_contract = {
			'quality': Number(forgery_quality.toFixed(2)),
			'owner_id': user_id,
			'own_gallery': user_id == npc_object.owner_id
		};

		forgery_contracts.insert(forgery_contract);
	}

	this.getForgeryHeat = function(forged_item_object, heat_category) {
		if (forged_item_object.authenticity.forgery === false) {
			return 0;
		}

	    var heat_min;
	    var heat_max;

	    switch(heat_category) {
	        case FORGERY_HEAT_CATEGORY.QUEST:
	            heat_min = .3;
	            heat_max = .95;
	            break;
	        case FORGERY_HEAT_CATEGORY.SELL:
	            heat_min = .5;
	            heat_max = .95;
	            break;
	        case FORGERY_HEAT_CATEGORY.DONATE:
	            heat_min = .2;
	            heat_max = .95;
	            break;
	        case FORGERY_HEAT_CATEGORY.COLLECTOR:
	            heat_min = .7;
	            heat_max = .95;
	            break;
	        case FORGERY_HEAT_CATEGORY.DISPLAY:
	            heat_min = 0;
	            heat_max = .05;
	            break;
	        default: 
	            heat_min = 0;
	            heat_max = 1;
	            break;
	    }

	    var heat_type_coefficient = 0;

	    var rarity_index = artwork_rarities.indexOf(forged_item_object.artwork_data.rarity);
	    var rarity_heat_coefficient = ((rarity_index + 1) / artwork_rarities.length) * FORGERY_TYPE_HEAT_COEFFICIENTS.RARITY;
	    heat_type_coefficient += rarity_heat_coefficient;

	    if (forged_item_object.foil) {
	        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.FOIL;
	    }

	    if (forged_item_object.unlocked) {
	        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.UNLOCKED;
	    }

	    if (forged_item_object.seasonal) {
	        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.SEASONAL;
	    }

	    if (forged_item_object.vintage) {
	        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.VINTAGE;
	    }

	    if (forged_item_object.lottery > 0) {
	        var lottery_heat_base_coefficient = .75;
	        var lottery_heat_coefficient = (1 - lottery_heat_base_coefficient) * (forged_item_object.lottery / 10);
	        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LOTTERY * (lottery_heat_base_coefficient + lottery_heat_coefficient));
	    }

	    if (forged_item_object.level > 1) {
	        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LEVEL * (forged_item_object.level / 10));
	    }

	    var quality_adjustment_coefficient = 1 - (.4 * forged_item_object.authenticity.forgery_quality);
	    heat_type_coefficient *= quality_adjustment_coefficient;

	    var heat_coefficient = heat_min + ((heat_max - heat_min) * Math.min(heat_type_coefficient, 1));

	    // reduce heat if not owner is unaware
	    if (forged_item_object.authenticity.identified !== undefined && !forged_item_object.authenticity.identified) {
	    	heat_coefficient *= .8;
	    }

	    return Number(heat_coefficient.toFixed(3));
	}

	this.discardForgeryContract = function(forgery_contract_id) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		if (forgery_contract_object && forgery_contract_object.owner_id == user_id) {
			forgery_contracts.remove(forgery_contract_id);
		}
	}
}