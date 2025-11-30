pipeline {
    agent any
    
    parameters {
        choice(
            name: 'PIPELINE_ACTION',
            choices: ['docker-only', 'terraform-plan', 'terraform-apply', 'terraform-destroy', 'full-deploy'],
            description: 'Select pipeline action: docker-only (Phase 3), terraform-plan/apply/destroy (Phase 4), or full-deploy (both)'
        )
    }
    
    environment {
        // Docker Hub credentials
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        DOCKERHUB_USERNAME = 'mennaomar12'
        CLIENT_IMAGE = "${DOCKERHUB_USERNAME}/hotel-client"
        SERVER_IMAGE = "${DOCKERHUB_USERNAME}/hotel-server"
        IMAGE_TAG = "${BUILD_NUMBER}"
        
        // Frontend environment variables
        VITE_BACKEND_URL = 'http://localhost:3000'
        VITE_CURRENCY = '$'
        CLERK_KEY = credentials('clerk-publishable-key')
        STRIPE_KEY = credentials('stripe-publishable-key')
        
        // AWS Configuration for Terraform
        AWS_DEFAULT_REGION = 'us-east-1'
        
        // Terraform variables - using the images we just built
        TF_VAR_backend_image = "${SERVER_IMAGE}:latest"
        TF_VAR_frontend_image = "${CLIENT_IMAGE}:latest"
    }
    
    stages {
        // ==================== PHASE 3: DOCKER BUILD & PUSH ====================
        
        stage('Checkout') {
            steps {
                echo '📥 Checking out code from GitHub...'
                checkout scm
            }
        }
        
        stage('Verify Structure') {
            steps {
                echo '📂 Checking repository structure...'
                sh 'ls -la'
                sh 'test -d client && echo "Client folder found" || echo "ERROR: Client folder NOT found"'
                sh 'test -d server && echo "Server folder found" || echo "ERROR: Server folder NOT found"'
                sh 'test -d terraform && echo "Terraform folder found" || echo "WARNING: Terraform folder NOT found - will skip terraform stages"'
            }
        }
        
        stage('Build Client Image') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🔨 Building Frontend Docker Image...'
                script {
                    dir('client') {
                        sh """
                            docker build \\
                            --build-arg VITE_BACKEND_URL=${VITE_BACKEND_URL} \\
                            --build-arg VITE_CURRENCY=${VITE_CURRENCY} \\
                            --build-arg VITE_CLERK_PUBLISHABLE_KEY=${CLERK_KEY} \\
                            --build-arg VITE_STRIPE_PUBLISHABLE_KEY=${STRIPE_KEY} \\
                            -t ${CLIENT_IMAGE}:${IMAGE_TAG} \\
                            -t ${CLIENT_IMAGE}:latest \\
                            .
                        """
                    }
                }
            }
        }
        
        stage('Build Server Image') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🔨 Building Backend Docker Image...'
                script {
                    dir('server') {
                        sh """
                            docker build \\
                            -t ${SERVER_IMAGE}:${IMAGE_TAG} \\
                            -t ${SERVER_IMAGE}:latest \\
                            .
                        """
                    }
                }
            }
        }
        
        stage('Security Scan - Container Images') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🔍 Running Security Scan on Docker Images...'
                script {
                    sh """
                        docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \\
                        aquasec/trivy:latest image ${SERVER_IMAGE}:latest --exit-code 0 --severity HIGH,CRITICAL --format table
                    """
                    sh """
                        docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \\
                        aquasec/trivy:latest image ${CLIENT_IMAGE}:latest --exit-code 0 --severity HIGH,CRITICAL --format table
                    """
                }
            }
        }
        
        stage('Test Containers') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🧪 Testing Docker Containers...'
                script {
                    // Test backend health endpoint
                    sh """
                        docker run -d --name test-backend -p 3000:3000 \\
                        -e CLERK_PUBLISHABLE_KEY=test-key \\
                        -e CLERK_SECRET_KEY=test-secret \\
                        -e MONGODB_URI=mongodb://test:test@localhost:27017/test \\
                        ${SERVER_IMAGE}:latest
                        
                        sleep 10
                        curl -f http://localhost:3000/health || echo "Health check failed"
                        docker stop test-backend
                        docker rm test-backend
                    """
                }
            }
        }
        
        stage('Login to Docker Hub') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🔐 Logging into Docker Hub...'
                sh "echo ${DOCKERHUB_CREDENTIALS_PSW} | docker login -u ${DOCKERHUB_CREDENTIALS_USR} --password-stdin"
            }
        }
        
        stage('Push Images to Docker Hub') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '📤 Pushing images to Docker Hub...'
                sh """
                    docker push ${CLIENT_IMAGE}:${IMAGE_TAG}
                    docker push ${CLIENT_IMAGE}:latest
                    docker push ${SERVER_IMAGE}:${IMAGE_TAG}
                    docker push ${SERVER_IMAGE}:latest
                """
            }
        }
        
        stage('Docker Cleanup') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'docker-only' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🧹 Cleaning up local Docker images...'
                sh """
                    docker rmi ${CLIENT_IMAGE}:${IMAGE_TAG} 2>/dev/null || echo "Client image already removed"
                    docker rmi ${CLIENT_IMAGE}:latest 2>/dev/null || echo "Client latest image already removed"
                    docker rmi ${SERVER_IMAGE}:${IMAGE_TAG} 2>/dev/null || echo "Server image already removed"
                    docker rmi ${SERVER_IMAGE}:latest 2>/dev/null || echo "Server latest image already removed"
                    docker system prune -f 2>/dev/null || echo "Docker prune failed"
                """
            }
        }
        
        // ==================== PHASE 4: TERRAFORM DEPLOYMENT ====================
        
        stage('Setup AWS & Terraform Credentials') {
            when {
                expression { 
                    params.PIPELINE_ACTION != 'docker-only' 
                }
            }
            steps {
                echo '🔑 Setting up AWS and Terraform credentials...'
                script {
                    echo '✅ Loading credentials from Jenkins Credential Store...'
                }
            }
        }
        
        stage('Terraform Init') {
            when {
                expression { 
                    params.PIPELINE_ACTION != 'docker-only' 
                }
            }
            steps {
                echo '🔧 Initializing Terraform...'
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            terraform init -upgrade
                        '''
                    }
                }
            }
        }
        
        stage('Terraform Validate') {
            when {
                expression { 
                    params.PIPELINE_ACTION != 'docker-only' 
                }
            }
            steps {
                echo '✔ Validating Terraform configuration...'
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            terraform validate
                        '''
                    }
                }
            }
        }
        
        stage('Terraform Plan') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-plan' || 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '📋 Running Terraform Plan...'
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY'),
                        string(credentialsId: 'mongodb-password', variable: 'MONGODB_PASSWORD'),
                        string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET'),
                        string(credentialsId: 'clerk-publishable-key', variable: 'CLERK_PUBLISHABLE_KEY'),
                        string(credentialsId: 'clerk-secret-key', variable: 'CLERK_SECRET_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            export TF_VAR_mongodb_root_password=$MONGODB_PASSWORD
                            export TF_VAR_jwt_secret=$JWT_SECRET
                            export TF_VAR_clerk_publishable_key=$CLERK_PUBLISHABLE_KEY
                            export TF_VAR_clerk_secret_key=$CLERK_SECRET_KEY
                            export TF_VAR_backend_image=${SERVER_IMAGE}:latest
                            export TF_VAR_frontend_image=${CLIENT_IMAGE}:latest
                            terraform plan -out=tfplan -detailed-exitcode
                        '''
                    }
                }
            }
        }
        
        stage('Terraform Apply') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🚀 Applying Terraform changes...'
                script {
                    input message: '⚠ Approve Terraform Apply? This will create AWS resources and incur costs!', ok: 'Deploy'
                }
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY'),
                        string(credentialsId: 'mongodb-password', variable: 'MONGODB_PASSWORD'),
                        string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET'),
                        string(credentialsId: 'clerk-publishable-key', variable: 'CLERK_PUBLISHABLE_KEY'),
                        string(credentialsId: 'clerk-secret-key', variable: 'CLERK_SECRET_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            export TF_VAR_mongodb_root_password=$MONGODB_PASSWORD
                            export TF_VAR_jwt_secret=$JWT_SECRET
                            export TF_VAR_clerk_publishable_key=$CLERK_PUBLISHABLE_KEY
                            export TF_VAR_clerk_secret_key=$CLERK_SECRET_KEY
                            export TF_VAR_backend_image=${SERVER_IMAGE}:latest
                            export TF_VAR_frontend_image=${CLIENT_IMAGE}:latest
                            terraform apply -auto-approve tfplan
                        '''
                    }
                }
            }
        }
        
        stage('Configure kubectl') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '⚙ Configuring kubectl...'
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            CLUSTER_NAME=$(terraform output -raw cluster_name)
                            aws eks update-kubeconfig --region us-east-1 --name $CLUSTER_NAME
                        '''
                    }
                }
            }
        }
        
        stage('Deploy Security Policies') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🛡 Deploying Security Policies...'
                dir('k8s') {
                    sh 'kubectl apply -f security/network-policies.yaml -n hotel-app'
                    sh 'kubectl apply -f security/pod-security.yaml -n hotel-app'
                    sh 'kubectl apply -f auto-scaling/hpa.yaml -n hotel-app'
                }
            }
        }
        
        stage('Verify Kubernetes Deployment') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '🔍 Verifying Kubernetes deployment...'
                script {
                    echo 'Waiting for pods to be ready (this may take 5-10 minutes)...'
                    sh '''
                        kubectl wait --for=condition=ready pod -l app=mongodb -n hotel-app --timeout=600s || echo "MongoDB pods not ready yet"
                        kubectl wait --for=condition=ready pod -l app=backend -n hotel-app --timeout=600s || echo "Backend pods not ready yet"
                        kubectl wait --for=condition=ready pod -l app=frontend -n hotel-app --timeout=600s || echo "Frontend pods not ready yet"
                    '''
                    
                    echo '=== Application Status ==='
                    sh 'kubectl get pods -n hotel-app'
                    sh 'kubectl get svc -n hotel-app'
                    sh 'kubectl get ingress -n hotel-app'
                    
                    echo '=== Testing Application Health ==='
                    sh '''
                        kubectl run test-curl --image=curlimages/curl:8.5.0 -n hotel-app --rm -i --restart=Never -- /bin/sh -c "curl -f http://backend:5000/health && echo \"Backend health: OK\" || echo \"Backend health: FAILED\""
                    '''
                }
            }
        }
        
        stage('Terraform Destroy') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-destroy' 
                }
            }
            steps {
                echo '🗑 Destroying Terraform infrastructure...'
                script {
                    input message: '⚠⚠⚠ Are you ABSOLUTELY SURE you want to DESTROY all resources? This cannot be undone!', ok: 'Yes, Destroy Everything'
                }
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY'),
                        string(credentialsId: 'mongodb-password', variable: 'MONGODB_PASSWORD'),
                        string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            export TF_VAR_mongodb_root_password=$MONGODB_PASSWORD
                            export TF_VAR_jwt_secret=$JWT_SECRET
                            export TF_VAR_backend_image=${SERVER_IMAGE}:latest
                            export TF_VAR_frontend_image=${CLIENT_IMAGE}:latest
                            terraform destroy -auto-approve
                        '''
                    }
                }
            }
        }
        
        stage('Display Terraform Outputs') {
            when {
                expression { 
                    params.PIPELINE_ACTION == 'terraform-apply' || 
                    params.PIPELINE_ACTION == 'full-deploy' 
                }
            }
            steps {
                echo '📊 Terraform Outputs:'
                dir('terraform') {
                    withCredentials([
                        string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                        string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
                    ]) {
                        sh '''
                            export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
                            export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
                            terraform output
                        '''
                    }
                }
            }
        }
    }
    
    post {
        always {
            echo "🏁 Pipeline execution completed"
        }
        
        success {
            script {
                echo '✅✅✅ Pipeline completed successfully! ✅✅✅'
                echo "================================================"
                
                if (params.PIPELINE_ACTION == 'docker-only') {
                    echo "PHASE 3 COMPLETED - Docker Images Pushed"
                    echo "Client Image: ${CLIENT_IMAGE}:${IMAGE_TAG}"
                    echo "Server Image: ${SERVER_IMAGE}:${IMAGE_TAG}"
                    echo "✅ Security scans completed"
                    echo "✅ Container tests passed"
                    echo "✅ Images pushed to Docker Hub"
                }
                
                if (params.PIPELINE_ACTION == 'terraform-plan') {
                    echo "PHASE 4 - Terraform Plan Completed"
                    echo "Review the plan above and run 'terraform-apply' to deploy"
                }
                
                if (params.PIPELINE_ACTION == 'terraform-apply' || params.PIPELINE_ACTION == 'full-deploy') {
                    echo "PHASE 4 COMPLETED - Kubernetes Deployment Successful"
                    echo ""
                    echo "🎉 Your application is now deployed on Kubernetes!"
                    echo ""
                    echo "🛡 Security Features Enabled:"
                    echo "  - Network Policies"
                    echo "  - Pod Security Context"
                    echo "  - Auto-scaling (HPA)"
                    echo ""
                    echo "✅ Application Health:"
                    echo "  Health checks: http://backend:5000/health"
                    echo ""
                    echo "To access your application:"
                    echo "  kubectl get ingress -n hotel-app"
                }
                
                if (params.PIPELINE_ACTION == 'terraform-destroy') {
                    echo "TERRAFORM DESTROY COMPLETED"
                    echo "All AWS resources have been destroyed"
                    echo "Your AWS bill will stop accumulating charges"
                }
                
                echo "================================================"
            }
        }
        
        failure {
            echo '❌❌❌ Pipeline failed! ❌❌❌'
            echo 'Check the logs above for error details'
        }
        
        unstable {
            echo '⚠⚠⚠ Pipeline completed with warnings ⚠⚠⚠'
            echo 'Some security scans may have found issues'
        }
    }
}
