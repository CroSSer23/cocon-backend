#! /bin/bash

npm install -g serverless
npm install -g serverless-plugin-split-stacks@1.9.3
echo $CODEBUILD_SRC_DIR/target/$env
if [ $env == "internalTesting" ]
then
    echo "Deploy internalTesting"
    serverless deploy --stage internalTesting --package $CODEBUILD_SRC_DIR/target/internalTesting --verbose -r eu-west-3
else
    echo "Not internalTesting env"
fi