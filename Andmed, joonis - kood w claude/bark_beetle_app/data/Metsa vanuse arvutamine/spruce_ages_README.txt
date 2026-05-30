Your output spruce_ages.geojson has all your original polygon attributes preserved, plus these new fields added by the script:
FieldWhat it iskkt_codeSite type name (e.g. "Jänesekapsa", "Mustika")H_inf_mAsymptotic max height for that site type (model parameter, metres)site_groupProductivity class (Ia, I, I-II, II, III, IV, V)ndsm_mean_mMean canopy height within the polygon (from CHM 4m raster)ndsm_p80_m80th-percentile canopy height — more robust, captures dominant treesndsm_pixelsNumber of valid raster pixels that fell inside the polygonest_age_mean_yrEstimated stand age from mean height (Kiviste 1997)est_age_p80_yrEstimated stand age from p80 height — this is the recommended onequality_flagData quality indicator
The quality flags mean:

OK — good estimate
NOT_SPRUCE — species field wasn't spruce (still processed, but flagged)
NO_DATA — polygon didn't overlap with any raster pixels
LOW_PIXELS — fewer than 5 pixels (unreliable mean)
TOO_SHORT — mean height below 2 m (too young or bare ground)
HEIGHT_EXCEEDS_HINF — measured height above the model's asymptote (unusual stand)