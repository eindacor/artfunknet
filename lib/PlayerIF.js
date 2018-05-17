PlayerIF = function(user) {
	var user_id;
	var user_object;
    var made_from_object = (typeof user !== "string");

    user_object = made_from_object ? user : getOneFromCollection("PlayerIF.js:ItemIF - " + user, Meteor.users, {'_id': user});

    if (user_object == undefined) {
		throw "invalid user: " + user;
	}

    user_id = user_object._id;

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

	this.isPatron = function() {
		return user_object.profile.patreon_data && user_object.profile.patreon_data.reward_data && user_object.profile.patreon_data.reward_data.tier
	}

	this.getPatreonTier = function() {
		if (this.isPatron()) {
			return user_object.profile.patreon_data.reward_data.tier;
		}
		else return undefined;
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
	        if (permissions.canQuickDiscard().result) {
	            item_ids.push(item_object._id);
	        }
	    }

	    return item_ids;
	}

	this.getQuickDiscardableItemInterfaces = function(to_archive, statuses) {
		var item_interfaces = [];

	    var all_discardable = getFromCollection("PlayerIF.js", items, {'owner': user_id, 'status': {$in: statuses}}).fetch();
	    for (var i=0; i<all_discardable.length; i++) {
	    	var item_interface = new ItemIF(all_discardable[i]);
	    	var permissions = new PlayerItemPermissions(this, item_interface);
	        if (permissions.canQuickDiscard(to_archive).result) {
	            item_interfaces.push(item_interface);
	        }
	    }

	    return item_interfaces;
	}

	this.canCompleteJob = function(quest_id) {
		var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.canCompleteJob()", quests, quest_id);
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

	var punishForgedQuest = function(player_interface, forged_item_interface, quest_object) {
		var player_item_interface = new PlayerItemIF(player_interface, forged_item_interface);
		forged_item_interface.punishForgeryOwner(player_interface);
                	
    	var forgery_reduction_coefficient = .75;
		var money_reward = quest_object.reward.money;
		var new_reward = Math.floor(money_reward * forgery_reduction_coefficient);

		var target = quest_object.target;
		target.splice(target.indexOf(forged_item_interface.getItemObject().artwork_id), 1);

		var rarity_rolled = JepLoot.catRoll(getSmartRarityMap(player_interface.getPlayerLevel(), 0));

		if (rarity_rolled == "legendary" || rarity_rolled == "masterpiece") {
			rarity_rolled = "rare";
		}

		var rolled_if = getRandomArtworkIFFromRarity(rarity_rolled);

		while (target.indexOf(rolled_if.getId()) != -1) {
			rolled_if = getRandomArtworkIFFromRarity(rarity_rolled)
		}

		target.push(rolled_if.getId());
		
		quests.update(quest_object._id, {$set: {'target': target, 'reward.money': new_reward}});
	}

	var getUniqueTargetItems = function(player_interface, quest_object) {
		var unique_targets_found = [];

		for (var i=0; i<quest_object.target.length; i++) {
        	var target_item_object = player_interface.getJobTarget(quest_object.target[i]);
        	if (target_item_object != undefined) {
        		var item_interface = new ItemIF(target_item_object);
        		var player_item_interface = new PlayerItemIF(player_interface, item_interface);
        		if (player_item_interface.catchForgery(FORGERY_HEAT_CATEGORY.QUEST)) {
					return {
						'forged_target': item_interface,
						'forgery_found': true
					};
                }

        		unique_targets_found.push(item_interface);
        	}
        }

        return unique_targets_found;
	}

	var itemIsSpecial = function(item_object) {
		return item_object.foil ||
			item_object.unlocked ||
			item_object.seasonal ||
			item_object.original ||
			item_object.vintage ||
			item_object.lottery > 0;
	}

	var sellTargets = function(player_interface, sell, donate, unique_targets_found) {
		if (sell || donate) {
        	//TODO replace with ItemIF array
            for (var i=0; i<unique_targets_found.length; i++) {
            	// check to verify item isn't part of multiple quests
            	var artwork_id = unique_targets_found[i].getItemObject().artwork_id;
            	if (getFromCollection("PlayerIF.js", quests, {'owner_id': user_id, 'target': {$in: [artwork_id]}}).count() > 1) {
            		continue;
            	}

            	if (itemIsMisprinted(unique_targets_found[i].getItemObject())) {
            		continue;
            	}

            	var player_item_interface = new PlayerItemIF(player_interface, unique_targets_found[i]);
            	if (player_item_interface.getPlayerItemPermissions().canQuickDiscard().result) {
	                if (sell) {
	                	player_item_interface.sell();
	                }

	                else if (donate) {
	                	player_item_interface.donate();
	                }
	            }
            }
        }
	}

	var giveQuestReward = function(player_interface, quest_object, unique_targets_found) {
		var special_count = 0;

        for (var i=0; i<unique_targets_found.length; i++) {
        	if (itemIsSpecial(unique_targets_found[i].getItemObject())) {
    			special_count++;
    		}
        }

        var base_xp = quest_object.reward.xp;
        var xp_recieved = base_xp;
		var target_differential = unique_targets_found.length - quest_object.min_requirement;
        xp_recieved += Math.floor(base_xp * target_differential * 0.4);
        xp_recieved += Math.floor(base_xp * special_count * 0.2);
        player_interface.addXP(xp_recieved, false);
        logXPChunkPercentage("quest", quest_object.reward.xp_chunk_percentage + (special_count * 0.3) + (target_differential * 0.5));
        player_interface.addFunds("quest", quest_object.reward.money);

		if (quest_object.reward.item != undefined) {
            var rarity = quest_object.reward.item.rarity;
            var count = getActiveArtworkCache()[rarity].length;
            var random_index = Math.floor(Math.random() * count);
            var random_artwork = getOneFromCollection("PlayerIF.js:PlayerIF.giveQuestItemReward()", artworks, {'_id': {$in: getActiveArtworkCache()[rarity]}}, {skip: random_index});

            var item_generator = {
                'source': "quest",
                'artwork_interface': new ArtworkIF(random_artwork),
                'foil_chance': quest_object.reward.item.foil ? 1 : undefined,
                'status': "unclaimed"
            }

            ITEM_GENERATOR.generateSingle(item_generator, player_interface);
        }
	}

	this.completeJob = function(quest_id, sell, donate) {
		try {
			if (sell && donate)
				return false;

			if (this.canCompleteJob(quest_id)) {
				//get targets
				//check for forgeries
				//check for uniques

				var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.completeJob()", quests, quest_id);

	            var unique_targets_found = getUniqueTargetItems(this, quest_object);

	            if (unique_targets_found.forgery_found) {
	            	punishForgedQuest(this, unique_targets_found.forged_target, quest_object);
	            }
	            else {
	            	giveQuestReward(this, quest_object, unique_targets_found);
	            	Meteor.users.update({'_id': user_id}, {$inc: {'profile.completed_quests': 1}});
	            	if (this.procUniqueAttribute("QUEST_TARGET_CONDITION_INCREASE", undefined)) {
		                updateItemsBySelector({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}, 'artwork_id': {$in: quest_object.target}}, {$set: {'condition': .9}});
		            }

		            sellTargets(this, sell, donate, unique_targets_found);

		            quests.remove(quest_id);
	            }
	        }
        }

        catch(error) {
        	console.log(error)
        }
	}

	this.cancelJob = function(quest_id) {
		var quest_object = getOneFromCollection("PlayerIF.js:PlayerIF.cancelJob()", quests, quest_id);
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
			var gallery_object = getOneFromCollection("PlayerIF.js", galleries, {'owner_id': ticket_object.gallery_owner});

			if (gallery_object == undefined) {
				gallery_tickets.remove(ticket_object._id);
				return;
			}

			if (user_object.profile.favorite_galleries.indexOf(gallery_object._id) == -1)
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
            'time' : getNowISOString(),
            'html' : undefined
        };

        alerts.insert(alert_object);
	}

	this.htmlAlert = function(html, icon, sentiment) {
		var alert_object = {
            'user_id' : user_id,
            'message' : undefined,
            'link' : '/',
            'icon' : icon,
            'sentiment' : sentiment,
            'time' : getNowISOString(),
            'html' : html
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

				var level_html = '<p>You have reached level <span class="af-color">' + level_hit + '</span>!</p>';
				this.htmlAlert(level_html, 'fa-star', 'good');

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
						var html;

						switch(key) {
							case 'repairing_cap' : html = '<p>Your item repair limit has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
							case 'inventory_cap' : html = '<p>Your inventory capacity has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'display_cap' : html = '<p>Your display capacity has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'auction_cap' : html = '<p>Your auction limit has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'ticket_cap' : html = '<p>Your ticket limit has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'pc_cap' : html = '<p>Your permanent collection capacity has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'visitor_cap' : html = '<p>Your gallery\'s visitor capacity has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        case 'forgery_contract_cap': html = '<p>Your forgery contract limit has increased to <span class="af-color">' + after_value + '</span>.</p>'; break;
					        default: html = '<p></p>'; break;
						}

						this.htmlAlert(html, 'fa-star', 'good');
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
	    var all_displayed;
	   	all_displayed = getFromCollection("PlayerIF.js:PlayerIF.updateGalleryDetails()", items, {'owner' : user_id, 'status' : "displayed", 'tutorial': {$ne: true}}).fetch();

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

            for (var n=0; n < item_attributes.length; n++) {
                var attribute_id = item_attributes[n]._id;
                var attribute_value = item_attributes[n].value;
                attribute_rating_total += item_attributes[n].value

                if (attribute_totals[attribute_id] === undefined) {
                	if (!item_object.authenticity.forgery) {
                		attribute_totals[attribute_id] = attribute_value;
                	}

                	else {
                		attribute_totals[attribute_id] = attribute_value;
                	}
                    
                    published_attribute_totals[attribute_id] = attribute_value;
                }

                else {
                	if (!item_object.authenticity.forgery) {
                		attribute_totals[attribute_id] += attribute_value;
                	}

                	else {
                		attribute_totals[attribute_id] += attribute_value;
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
	    var gallery_object = getOneFromCollection("PlayerIF.js:PlayerIF.updateGalleryDetails()", galleries, {"owner_id" : user_id});

	    var patreon_tier = this.getPatreonTier();
	    var show_patreon_status = user_object.profile.settings.show_patreon_status;

	    if (gallery_object == undefined) {
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
	            'active_unique_attributes': active_unique_attributes,
	            'patreon_tier': patreon_tier,
	            'show_patreon_status': show_patreon_status
	        });
	    }

	    else {
	    	if (gallery_score == 0) {
	    		Meteor.users.update({}, {$pull: {'profile.favorite_galleries': gallery_object._id}}, {multi: true});
	    	}

	    	galleries.update({'owner_id' : user_id}, 
		        {$set: {
		            'procs': procs,
		            'published_procs': published_procs,
		            'score': gallery_score, 
		            'value': gallery_value,
		            'gallery_rarity_npc_coefficient': gallery_rarity_npc_coefficient,
		            'earnings_per_hour': earnings_per_hour,
		            'xp_per_hour': xp_per_hour,
		            'active_unique_attributes': active_unique_attributes,
		            'patreon_tier': patreon_tier,
	            	'show_patreon_status': show_patreon_status
		        }
		    });
	    }

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
	        if (permissions.canQuickDiscard().result) {
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
		var discardable_interfaces = this.getQuickDiscardableItemInterfaces(to_archive, ["unclaimed", "won"]);

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

	this.getDiscardableDealerInterfaces = function(to_archive) {
		var discardable_interfaces = this.getQuickDiscardableItemInterfaces(to_archive, ["for_sale"]);

		var applicable_interfaces = [];
		var total_value = 0;

		for (var i=0; i<discardable_interfaces.length; i++) {
            var item_interface = discardable_interfaces[i];
            var player_item_interface = new PlayerItemIF(this, item_interface);

            if (to_archive) {
	            if (player_item_interface.getRecommendedStatus().upgrade && !user_object.profile.settings.auto_archive_upgrades) {
	            	continue;
		        }
	        }

            total_value += getItemObjectValueByType(item_interface.getItemObject(), "dealer", user_object._id);

            if (total_value > user_object.profile.bank_balance) {
            	return;
            }

            applicable_interfaces.push(player_item_interface);
        }

        return {
        	'total_value': total_value,
        	'applicable_interfaces': applicable_interfaces
        }
	}

	this.purchaseAndArchiveAllForSale = function() {
		var discardable_dealer_interfaces = this.getDiscardableDealerInterfaces(true);

		if (discardable_dealer_interfaces) {
	        for (var i=0; i<discardable_dealer_interfaces.applicable_interfaces.length; i++) {   
	            discardable_dealer_interfaces.applicable_interfaces[i].archive();
	        }
	    }
	}

	this.deleteAllDisplaced = function() {
		items.remove({'owner': user_id, 'status': "archived", 'displaced': true});
	}

	this.donateAllUnclaimed = function() {
		var discardable_interfaces = this.getQuickDiscardableItemInterfaces(false, ["unclaimed", "won"]);

        for (var i=0; i<discardable_interfaces.length; i++) {
            var item_interface = discardable_interfaces[i];
            var player_item_interface = new PlayerItemIF(this, item_interface);
            player_item_interface.donate();
        }
	}

	this.purchaseAndDonateAllForSale = function() {
		var discardable_dealer_interfaces = this.getDiscardableDealerInterfaces(false);

		if (discardable_dealer_interfaces) {
	        for (var i=0; i<discardable_dealer_interfaces.applicable_interfaces.length; i++) {   
	            discardable_dealer_interfaces.applicable_interfaces[i].donate();
	        }
	    }
	}

	this.getMaxQuests = function(npc_object) {
	    if ((npc_object == undefined || npc_object.owner_id == user_id) && this.procUniqueAttribute("QUEST_CAP_BYPASS", undefined)) {
	        return DEFAULT_JOB_LIMIT * 2;
	    } else {
	        return DEFAULT_JOB_LIMIT;
	    }
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

	this.displayAllTagged = function(tag_array) {
        var tagged_items = getFromCollection("PlayerIF.js:PlayerIF.displayAllTagged()", items, {'owner': user_id, 'tags': {$in: tag_array}, 'status': {$ne: "displayed"}}).fetch();
        var has_capacity = getFromCollection("PlayerIF.js:PlayerIF.displayAllTagged()", items, {'owner' : user_id, 'status' : "displayed"}).count() + tagged_items.length <= user_object.profile.display_cap;

        if (!has_capacity)
            return false;

        var unique_artwork_ids = [];

        for (var i=0; i<tagged_items.length; i++) {
            if (unique_artwork_ids.indexOf(tagged_items[i].artwork_id) != -1) {
            	return false;
            }

            else {
            	unique_artwork_ids.push(tagged_items[i].artwork_id);
            }

            var permissions = new PlayerItemPermissions(this, new ItemIF(tagged_items[i]));
            if (!permissions.canDisplay().result) {
                return false;
            }
        }

        for (var i=0; i<tagged_items.length; i++) {
            var player_item_interface = new PlayerItemIF(this, new ItemIF(tagged_items[i]));
            player_item_interface.setDisplayStatus(true);
        }

        return true;
	}

	this.clearDisplay = function() {
		var displayed_items = getFromCollection("PlayerIF.js:PlayerIF.clearDisplay()", items, {'owner': user_id, 'status': "displayed"}).fetch();
        
        for (var i=0; i<displayed_items.length; i++) {
            var player_item_interface = new PlayerItemIF(this, new ItemIF(displayed_items[i]));
            player_item_interface.setDisplayStatus(false);
        }
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

	this.increaseVisitorIgnorePenalty = function(item_interface) {
    	var visitor_ignore_coefficient_increase = .08;
    	var visitor_ignore_coefficient_max = .99;

    	var rarity_index = artwork_rarities.indexOf(item_interface.getRarity()) + 1;

    	var base = 3 - ((rarity_index - 1) * .175);

    	var visitor_ignore_proc_count_increase = Math.floor(Math.pow(base, rarity_index));
    	visitor_ignore_coefficient_increase *= rarity_index;

    	var current_ignore_coefficient = user_object.profile.visitor_ignore_coefficient;
    	var new_ignore_coefficient = Math.min(current_ignore_coefficient + visitor_ignore_coefficient_increase, visitor_ignore_coefficient_max);

    	Meteor.users.update({'_id': user_id}, {$set: {'profile.visitor_ignore_coefficient': new_ignore_coefficient}, $inc: {'profile.visitor_ignore_proc_count': visitor_ignore_proc_count_increase}});
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

	this.getForgeryCost = function(item_interface, forgery_contract_id) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		var values_object = item_interface.getItemObject().values;
		var forgery_quality_value_coefficient = .4;
		var forgery_quality_value_inverse_coefficient = 1 - forgery_quality_value_coefficient;
		var cost_adjuster = (FORGERY_COST_COEFFICIENT * forgery_quality_value_inverse_coefficient) + (FORGERY_COST_COEFFICIENT * forgery_quality_value_coefficient * forgery_contract_object.quality);

		var cost = values_object.actual * cost_adjuster;

		var dealer_discount = this.procUniqueAttribute("DEALER_ITEM_FORGERY_DISCOUNT", undefined) && item_interface.getStatus() == "for_sale";

		if (!dealer_discount && item_interface.getStatus() != "archived") {
			cost *= 1.5;
		}

		if (dealer_discount) {
            cost *= .5;
        }

		return Math.floor(cost);
	}

	this.getExpectedForgeryHeat = function(item_interface, heat_category, forgery_contract_id) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		if (forgery_contract_object) {
			return getForgeryHeatFromQuality(item_interface, this, heat_category, forgery_contract_object.quality, false);
		}
		else return 1;
	}

	this.discardForgeryContract = function(forgery_contract_id) {
		var forgery_contract_object = forgery_contracts.findOne(forgery_contract_id);
		if (forgery_contract_object && forgery_contract_object.owner_id == user_id) {
			forgery_contracts.remove(forgery_contract_id);
		}
	}

	this.getReputation = function() {
		return 1 - user_object.profile.visitor_ignore_coefficient;
	}

	this.beginTutorial = function(tutorial_name) {
		this.finishTutorials();
		var setter = {};	
		setter["profile.tutorial_data.current_tutorial"] = tutorial_name == undefined ? "artfunkel basics" : tutorial_name;
		setter["profile.tutorial_data.step"] = 0;

	    Meteor.users.update(user_id, {$set: setter}, function() {
	    	var nested_player_interface = new PlayerIF(user_id);
	    	nested_player_interface.updateCaps();
	    	nested_player_interface.refresh();
	    	nested_player_interface.updateGalleryDetails();
	    });
	}

	this.finishTutorials = function() {
		items.remove({'owner': user_id, 'tutorial': true});
		npcs.remove({'owner_id': user_id, 'tutorial': true});
		npcs.update({'tutorial': true}, {$pull: {'players_met': user_id}}, {multi: true});
		
		var snapshot_object = user_object.profile.pre_tutorial_snapshot;

		var current_tutorial = user_object.profile.tutorial_data.current_tutorial;
		var completed = user_object.profile.tutorial_data.completed;
		if (current_tutorial && completed.indexOf(current_tutorial) == -1) {
			completed.push(current_tutorial);
		}

		if (snapshot_object) {
			snapshot_object.tutorial_data.current_tutorial = undefined;
			snapshot_object.tutorial_data.step = 0;
			snapshot_object.tutorial_data.completed = completed;
			Meteor.users.update(user_id, {$set: {'profile': snapshot_object}}, function() {
		    	var nested_player_interface = new PlayerIF(user_id);
		    	nested_player_interface.updateCaps();
		    	nested_player_interface.refresh();
		    	nested_player_interface.updateGalleryDetails();
		    });
		}
		else {
			Meteor.users.update(user_id, {$set: {'profile.tutorial_data': {'current_tutorial': undefined, 'step': 0, 'completed': completed}}}, function() {
		    	var nested_player_interface = new PlayerIF(user_id);
		    	nested_player_interface.updateCaps();
		    	nested_player_interface.refresh();
		    	nested_player_interface.updateGalleryDetails();
		    });
		}
	}

	this.updateCaps = function() {
		var cap_object = getCapSetterObject(user_object.profile.level);
		var setter = {};

        var cap_keys = Object.keys(cap_object);
        for (var i=0; i < cap_keys.length; i++) {
            var key = cap_keys[i];
            var value = cap_object[key];

            var setter_key = "profile." + key;
            setter[setter_key] = value;
        }

        Meteor.users.update(user_id, {$set : setter});
	}

	this.refresh = function() {
		user_object = Meteor.users.findOne(user_id);
	}

	this.getJobTarget = function(artwork_id) {
		var base_query = {
			'owner': user_id,
			'status': {$in: ["claimed", "displayed", "auctioned"]},
			'artwork_id': artwork_id,
		}

		var special_array = [{'foil': true}, {'unlocked': true}, {'original': true}, {'vintage': true}, {'lottery': {'$gt': 0}}];
		var or_string = '$or';

		var quest_target_item;

		//special legitimate id'ed items
		var special_query_id = JSON.parse(JSON.stringify(base_query));
		special_query_id[or_string] = special_array;
		special_query_id["authenticity.forgery"] = false;
		special_query_id["authenticity.identified"] = true;
		quest_target_item = items.findOne(special_query_id);

		if (quest_target_item != undefined) {
			return quest_target_item;
		}

		//legitimate id'ed items
		var regular_query_id = JSON.parse(JSON.stringify(base_query));
		regular_query_id["authenticity.forgery"] = false;
		regular_query_id["authenticity.identified"] = true;
		quest_target_item = items.findOne(regular_query_id);

		if (quest_target_item != undefined) {
			return quest_target_item;
		}

		//special unid'ed items
		var special_query_unid = JSON.parse(JSON.stringify(base_query));
		special_query_unid[or_string] = special_array;
		special_query_unid["authenticity.identified"] = false;
		quest_target_item = items.findOne(special_query_unid, {fields: {'authenticity.forgery': 0}});

		if (quest_target_item != undefined) {
			return quest_target_item;
		}

		//regular unid'ed items
		var regular_query_unid = JSON.parse(JSON.stringify(base_query));
		regular_query_unid["authenticity.identified"] = false;
		quest_target_item = items.findOne(regular_query_unid, {fields: {'authenticity.forgery': 0}});

		if (quest_target_item != undefined) {
			return quest_target_item;
		}

		//forged special items
		var forgery_special_query = JSON.parse(JSON.stringify(base_query));
		forgery_special_query[or_string] = special_array;
		forgery_special_query["authenticity.forgery"] = true;
		forgery_special_query["authenticity.identified"] = true;
		quest_target_item = items.findOne(forgery_special_query);

		if (quest_target_item != undefined) {
			return quest_target_item;
		}

		//forged regular items
		var regular_query = JSON.parse(JSON.stringify(base_query));
		regular_query["authenticity.forgery"] = true;
		regular_query["authenticity.identified"] = true;
		quest_target_item = items.findOne(regular_query);

		return quest_target_item;
	}

	this.getJobTargetsOwned = function(job_object) {
		var targets_owned = 0;
		var targets = job_object.target;
		for (var i=0; i<targets.length; i++) {
			var target_id = targets[i];
			var query = {
				'owner': user_id,
				'status': {$in: ["claimed", "displayed", "auctioned"]},
				'artwork_id': target_id,
			}

			if (items.findOne(query)) {
				targets_owned++;
			}
		}
		return targets_owned;
	}

	this.getJobProgress = function(job_id) {
		var job_object = quests.findOne(job_id);
		var targets_owned = this.getJobTargetsOwned(job_object);
		return {
			'owned': targets_owned,
			'min_requirement': job_object.min_requirement,
			'target_count': job_object.target.length,
			'can_complete': targets_owned >= job_object.min_requirement,
			'fully_complete': targets_owned >= job_object.target.length
		}
	}

	this.canVintage = function() {
		if (auctions.findOne({'seller': user_object.profile.screen_name}) != undefined || 
            user_object.profile.auction_data.winning.length > 0 ||
            user_object.profile.level < PLAYER_LEVEL_MAX) {
            return false;
        }

        return true;
	}

	this.vintageMode = function(item_ids) {
		if (!this.canVintage()) {
			console.log("cant vintage")
			return false;
		}

		var vintage_item_limit = user_object.profile.vintage_count + 1;
		if (item_ids.length > vintage_item_limit) {
			console.log("limit violation");
			return false;
		}

		for (var i=0; i<item_ids.length; i++) {
			var player_item_interface = new PlayerItemIF(this, new ItemIF(item_ids[i]));
			var permissions_response = player_item_interface.getPlayerItemPermissions().canVintage();
			if (!permissions_response.result) {
				console.log("permissions: " + permissions_response.reason);
				return false;
			}
		}

		items.find({'_id': {$nin: item_ids}, 'owner': user_id, 'status': {$ne: 'archived'}, 'original': false}).forEach(function(item_object) {
			if (itemIsMisprinted(item_object)) {
                return;
            }

            removeItem(item_object._id, "vintage clear unclaimed", undefined);
        });

		items.find({'_id': {$in: item_ids}}).forEach(function(item_object) {
			var item_interface = new ItemIF(item_object);
			var player_item_interface = new PlayerItemIF(new PlayerIF(user_object), item_interface);
			player_item_interface.makeLiable();
			item_interface.updateItem({$set: {'vintage': true, 'status': "claimed", 'repairing': false}}, false, undefined);
		})


        this.vintageProfile();
	}

	this.vintageProfile = function() {
		if (!this.canVintage()) {
			return false;
		}

        // reset profile limits
        var cap_object = getCapSetterObject(0);
        var setter = {};
        var cap_keys = Object.keys(cap_object);
        for (var i=0; i < cap_keys.length; i++) {
            var key = cap_keys[i];
            var value = cap_object[key];

            var setter_key = "profile." + key;
            setter[setter_key] = value;
        }

        setter["profile.level"] = 0;
        setter["profile.bank_balance"] = STARTING_BALANCE + Math.floor(4000000 * (user_object.profile.vintage_count + 1));
        setter["profile.xp"] = 0;
        setter["profile.last_drop"] = moment().add(-1, 'days')._d.toISOString();

        Meteor.users.update(
            user_id,                //selector
            {                               //modifier
                $inc: {'profile.vintage_count': 1, 'profile.lottery_tickets': 1}, 
                $set: setter
            }
        );

        quests.remove({'owner_id': user_id});
        forgery_contracts.remove({'owner_id': user_id});
	}

	//TODO in server.js get rid of current_state field

	this.nextTutorialStep = function() {
		var next = TUTORIAL_HANDLER.getNext(user_object.profile.tutorial_data.current_tutorial, user_object.profile.tutorial_data.step);
		if (next === undefined) {
			Meteor.users.update(user_id, {$set: {'profile.tutorial_data.current_tutorial': undefined, 'profile.tutorial_data.step': 0}});
		}
		else {
			Meteor.users.update(user_id, {$set: {'profile.tutorial_data.step': next}});
		}
	}

	this.hasNextTutorialStep = function() {
		var next = TUTORIAL_HANDLER.getNext(user_object.profile.tutorial_data.current_tutorial, user_object.profile.tutorial_data.step);
		return next !==  undefined;
	}

	this.previousTutorialStep = function() {
		var current_step = user_object.profile.tutorial_data.step
		if (user_object.profile.tutorial_data.step != 0) {
			Meteor.users.update(user_id, {$set: {'profile.tutorial_data.step': current_step - 1}});
		}
	}

	this.getTutorialText = function() {
		return TUTORIAL_HANDLER.getText(user_object.profile.tutorial_data.current_tutorial, user_object.profile.tutorial_data.step);
	}
}