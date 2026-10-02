{{{utility_funcs}}}

float getModifiedDot(vec2 uv, vec2 p, float gridDimension, float pHash, float time) {
    float rotation = sin(time * .1 + pHash) * 2. * PI;
    if (pHash < .5) {
        rotation *= -1.;
    }
    mat2 rotationMatrix = createRotationMatrix(rotation);
    
    return dot((uv - p) / gridDimension, getRandomVector(pHash) * rotationMatrix);
}

float getPerlinIterationValue(vec2 uv, float gridDimension, float time) {
    float xCoord = floor(uv.x / gridDimension) * gridDimension;
    float yCoord = floor(uv.y / gridDimension) * gridDimension;
    
    float xIndex = floor(uv.x / gridDimension);
    float yIndex = floor(uv.y / gridDimension);
    
    float p0Hash = hash(vec2(xIndex, yIndex));
    float p1Hash = hash(vec2(xIndex, yIndex + 1.));
    float p2Hash = hash(vec2(xIndex + 1., yIndex + 1.));
    float p3Hash = hash(vec2(xIndex + 1., yIndex));
    
    vec2 p0 = vec2(xCoord, yCoord);
    vec2 p1 = vec2(xCoord, yCoord + gridDimension);
    vec2 p2 = vec2(xCoord + gridDimension, yCoord + gridDimension);
    vec2 p3 = vec2(xCoord + gridDimension, yCoord);
    
    float rotation = sin(u_time * .15) * 2. * PI;
    mat2 rotationMatrix = createRotationMatrix(rotation);
    
    float dot0 = getModifiedDot(uv, p0, gridDimension, p0Hash, time);
    float dot1 = getModifiedDot(uv, p1, gridDimension, p1Hash, time);
    float dot2 = getModifiedDot(uv, p2, gridDimension, p2Hash, time);
    float dot3 = getModifiedDot(uv, p3, gridDimension, p3Hash, time);
    
    float xInterp = smoothstep(p0.x, p2.x, uv.x);
    float yInterp = smoothstep(p0.y, p2.y, uv.y);
    
    float val = biLerp(dot0, dot1, dot2, dot3, xInterp, yInterp);

    float xLerp = mod(uv.x / 2., gridDimension);
    float revealMargin = gridDimension * .95;
    
    return val;
    return pow(mix(-1., 1., (val + 1.) / 2.), .5);
}

float getPerlinValue(vec2 uv, float gridDimension, int iterations, float time) {
    uv /= 50.;
    float val = 0.;
    int iterationCount = iterations < 4 ? iterations : 4;
    for (int i=0; i<4; i++) {
        if (i < iterationCount) {
            val += getPerlinIterationValue(uv, gridDimension * 1. / pow(2., float(iterationCount)), time);
            uv *= 2.;
        }
    }
    
    return val;
}

float getRaritySeed(int itemRarityIndex) {
  if (itemRarityIndex == 0) {
    return .4;
  } else if (itemRarityIndex == 1) {
    return .8;
  } else if (itemRarityIndex == 2) {
    return .4;
  } else if (itemRarityIndex == 3) {
    return .4;
  }

  return .2;
}

void main() {
    AspectRatioData aspectRatioData = getAspectRatioData(u_resolution.xy);
    vec2 uv = gl_FragCoord.xy/u_resolution;
    uv = uv * aspectRatioData.scaleMatrix;
    
    float gridSize = .08;
    float time = u_time + hash(vec2(u_condition, .2));
    uv += vec2(time * .02, 0.);
    
    float perlinVal = getPerlinValue(uv, gridSize, 1, time * .3);
    float perlinVal2 = getPerlinValue(uv, gridSize * 2., 1, time * .1);

    float perlinMix = mix(perlinVal, 1., perlinVal2);
    perlinMix = mix(perlinMix, 1., getPerlinValue(uv, gridSize * .08, 1, time));

    vec3 imagePaletteColors[IMAGE_PALETTE_SIZE];
    getImagePalette(.5, imagePaletteColors);

    vec3 firstContrast;
    vec3 secondContrast;
    getHighestContrastColors(imagePaletteColors, firstContrast, secondContrast);

    vec3 lightColor = firstContrast;
    vec3 darkColor = secondContrast;
    if (getColorContrastRating(BLACK, firstContrast) > 
        getColorContrastRating(BLACK, secondContrast)) {
        darkColor = firstContrast;
        lightColor = secondContrast;
    }

    vec3 colorOut = mix(firstContrast, secondContrast, perlinMix);

    float valueModifier = mix(.5, .7, u_condition);

    gl_FragColor = vec4(valueModifier * colorOut, 1.0);
}